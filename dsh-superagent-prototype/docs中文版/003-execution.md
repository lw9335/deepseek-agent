# 003 执行

本文档跟随一个已接受的 Ticket，走过执行、交付和恢复的过程。它建立在 [001 领域模型](001-domain.md) 和 [002 授权](002-authorization.md) 之上。

## Ticket 阶段

每个未结束的 Ticket 都处于一个阶段，由它在等待什么来决定。从上往下读这张表；第一个匹配的行生效。

| 阶段 | 条件 | 面板标签 |
| --- | --- | --- |
| person / delivery | 向 Executor Session 送达 Input 失败；2 秒后重试，之后的延迟逐次翻倍，最多一分钟；一次成功、一个新的 Assignment 或 Ticket 结束都会清除它 | Input 未送达 |
| person / answer | 它有一个 Attention | 等待回答 |
| person / review | 最新的 Report 是 `ready` | 等待评审 |
| person / blocked, failed | 最新的 Report 是 `blocked` 或 `failed`，且此后没有人的消息送达该 Ticket | 受阻 · 失败 |
| working / queued | 没有 Assignment，或有一个 pending 的 | 排队中 |
| idle | 最新的 Report 是 `waiting`，或 Assignment 已结束 | 等待 Trigger |
| working | 其他所有情况 | 工作中 |

`person` 阶段表示 Ticket 没有人的输入就无法继续。一条新的人类消息会把 `blocked` 或 `failed` 的 Ticket 交还给其 Executor，于是它进入下一个匹配的阶段，通常是 `working`。

`idle` 的 Ticket 已经结束了本轮，且没有未决的问题。订阅 Thread 上的一个 Trigger 可以让它继续。

## Executor

每个 Ticket 会得到一个名为 `worker-<ticket id>` 的 Executor Session，以及一个以 Ticket 短名称命名的目录。目录创建在配置的执行根目录下，默认是 `<stateDir>/work`。

Executor Session 以操作者的操作系统用户身份运行命令，无需批准。它们的 `dsh-superagent-worker` 预设包含工作所需的工具，并会在 5 秒后把前台 shell 命令转为后台任务。这让 worker 能在下一步就收到新消息，而不必等一个长命令跑完。

主 Session 使用 `dsh-superagent-router`，有同样的 5 秒 shell 和任务等待限制，以及一套更小的、用于路由的工具集。Session 保留创建时选定的预设。worker 的子 agent 使用 DeepSeek Harness 的 `standard` 预设。

### 后台工作与 worker 槽位

当一轮结束时仍有 shell 任务或子 agent 在运行，Ticket 会保留其 worker 槽位并保持工作状态。它不会被报告为等待中，主 Session 也不会收到等待报告。完成的任务或子 agent 会在同一个槽位中带着结果唤醒 Executor。一旦某轮结束时没有后台工作，Executor 就正常报告等待。

每轮结束后，后台工作最多有 30 分钟来完成。到达这个上限时，shell 任务会被杀掉，Ticket 被报告为等待中。报告中包含 Executor 的最后一段话，以及哪些任务被杀掉、哪些子 agent 仍在活动。子 agent 被允许继续运行。Executor 会在下一轮读取被杀任务的结果。

交接给人会立即释放槽位，并保持 Report 有效。这适用于 `ready` Report 或提问之后（除非此后又到达了别的 Input），以及任何 `blocked` 或 `failed` Report 之后。

交接时，子 agent 会停止。shell 任务，例如为评审提供的服务器，可以继续运行到 Assignment 结束。它们不占用槽位，也不受 30 分钟限制，包括在之后的轮次中。它们的完成不会唤醒 Executor；它会在下一轮读取结果。

人也可以直接在 Executor Session 中写字来开始一轮。这一轮的后台工作遵循同样的规则。

当 Assignment 结束时，它的 shell 任务会被杀掉，且不唤醒 Session。它的子 agent 会被释放，它们唤醒的任何完成轮次都会被丢弃。替代的 Assignment 及其等待中的 Input 在关闭完成后才开始。

在 DeepSeek Harness 进程内停止或重启插件，走同样的关闭路径。尚未纳入 Session 历史的 Input 会被保留。关闭时会为每个 worker 的后台工作最多等待 10 秒；进程重启则直接结束这些工作。忙碌时被中断的 Assignment 会带着一条恢复说明重新开始。

worker 的子 agent（包括嵌套的子 agent）使用 DeepSeek Harness 的 `standard` 预设，拥有 worker 的权限。它们只保留 worker 被允许的工作工具，并在 Ticket 结束时失去这些工具。在 `standard` 下，shell 命令在 60 秒后转到后台。子 agent 结束时，它的任务会被杀掉。

### 准备 Ticket 目录

在第一个 Assignment 之前，如果 Ticket 目录不存在，准备命令会在执行根目录下用 `sh` 运行一次。它有十分钟来完成。没有准备命令时，worker 从一个空目录开始。

命令失败会使 Ticket 失败并记录其输出。重试，或某人在该 Ticket 某个 Thread 上的消息，会再次尝试准备。典型的命令用 `git worktree` 创建一个检出。当 pull request 分支的最后一段路径与 Ticket 的短名称匹配时，该 pull request 属于这个 Ticket。

### 并发

Ticket 从一次启动开始（包括准备）占用一个 worker 槽位，或者从唤醒其空闲 Executor 的那次送达开始占用。在活跃的一轮中，它也一直占用该槽位。

配置的并发上限适用于这些槽位，另外还有一个额外槽位，留给人的消息或状态请求。当普通槽位满了时，这类唤醒可以使用额外槽位，并且会在新的启动之前拿到下一个空闲槽位。因此，新工作无法阻止人继续一个已有的 Ticket。

其他 Input，例如 CI 结果，要等一个普通槽位。启动在 `working / queued` 中等待，直到有空闲槽位。启动是并发运行的，所以一个慢的准备命令只会拖慢它自己的 Ticket。

### 执行变量

准备命令和 Executor 的说明会收到同样的执行变量。命令读取环境变量；Executor 在其提示词中读取它们的值和描述。它们都不包含凭据。

| 变量 | 注册者 | 值 |
| --- | --- | --- |
| `DSH_SUPERAGENT_DIR`、`DSH_SUPERAGENT_NAME`、`DSH_SUPERAGENT_TICKET` | Executor | Ticket 的目录、短名称和 id |
| `DSH_SUPERAGENT_BLOCKED_COMMANDS` | Executor | Executor 不得运行的命令 |
| `DSH_SUPERAGENT_GITHUB_REPOSITORY` | GitHub | Source 监听的仓库，格式为 `owner/name` |
| `DSH_SUPERAGENT_GITHUB_ACCOUNT`、`DSH_SUPERAGENT_GITHUB_COMMIT_EMAIL` | GitHub | agent 账号及其提交邮箱 |
| `DSH_SUPERAGENT_GITHUB_NUMBER`、`DSH_SUPERAGENT_GITHUB_PR_HEAD` | GitHub | 发起该 Ticket 的 Issue 或 pull request，以及当它是 pull request 时的 head ref |
| `DSH_SUPERAGENT_FEISHU_BOT`、`DSH_SUPERAGENT_FEISHU_CHAT` | 飞书 | 机器人，以及发起该 Ticket 的群 |

Ticket 特有的值来自其目录和起始 Trigger。其他值来自当前的部署设置。只有面板能修改执行环境设置；发给主 Session 的文本不能修改配置的 shell 命令。

worker 通过 agent 账号的 `gh` 访问 GitHub，通过机器人的 `lark-cli` 访问飞书。被禁止的命令在按名称调用时会失败。

这些包装器和目录建立的是默认值，而不是安全边界。worker 仍然可以通过绝对路径执行程序。

## 合并

自动合并由 **Delivery requirements** 提示词控制。宿主没有专门针对合并的决策逻辑。

默认情况下，Executor 永远不会以 agent 账号启用自动合并：GitHub 会把合并归到启用它的人名下。Delivery requirements 必须指定另一个账号的 CLI 来合并。没有的话，就由人来合并 pull request。

默认说明只允许对为该 Ticket 开出的 pull request 启用自动合并，条件是它已就绪、所需的批准覆盖了 head 提交、且新增加删除少于 200 行。在推送另一个修订之前，Executor 会撤销自动合并。

没有正文的评审（例如批准）也会作为 Trigger 到达，可以唤醒一个等待评审的 Executor。这些说明约束的是 agent，而不是 GitHub 的合并规则。要强制批准，请在分支保护中要求批准，并忽略过时的批准。省略合并 CLI 或删除自动合并那一段，就会要求手动合并。

## Ticket 如何结束

- **没有 pull request 的就绪：** `ready` Report 会以已完成结束 Ticket。
- **无事可做：** Executor 发现没有需要人处理的工作，例如请求无法复现或已被取代，就报告 `dropped`。Ticket 结束且不发消息，除非某条匹配的规则要求发一条；之后某人在其 Thread 上的消息会恢复它。
### Pull request

一旦 Executor 报告了 Ticket 起始的那个 pull request，Ticket 就会跟随它。它也会跟随从其分支开出的每个 pull request，只要它被 Executor 报告，或被 GitHub Source 发现。重新打开的 pull request 会再次被跟随。

当 Ticket 开出的 pull request 都不再处于打开状态时，Ticket 就完成了。如果它一个都没开，它跟随的所有 pull request 都必须已关闭。然后它以最后一次相关关闭的结果结束，并保留其 Subscription，允许之后的人类评论恢复它。

当恢复、重试或恢复中的工作尚未完成时，关闭不会结束 Ticket。如果 Executor 确认或回答了一条它拥有的后续消息，但在读取那条消息后还没有做出非 progress 的 Report 或结束一轮，关闭也会等待。之后的 `ready` Report 会在同样的 pull request 完成规则满足后结束 Ticket。

聊天 Channel 会收到一条关于 pull request 结果的最终通知。GitHub 本身已经在 pull request 上显示了结果。删除 Ticket 对某个 pull request 的 Subscription，也会让它不再跟随该 pull request。

因此，"等待评审"意味着带有 pull request 的 `ready` Report。

### 后续消息与上下文 Thread

Executor 决定其 Ticket 自己 Thread 上的人类后续消息。它处理范围内的请求，并退回超出范围或属于其他 Ticket 的请求。一旦没有 Executor 拥有这条消息，它就成为主 Session 的候选。除此之外，主 Session 只能按此人的要求，对后续消息采取停止工作的行动。

Session 把一条 Input 纳入某一步，并随后报告或结束一轮之后，这条 Input 才算已读。当 Ticket 结束时，未读且未被确认、回答或退回的消息会回到 Eval，如 [002 授权](002-authorization.md) 所述。已读但未采取行动的消息（例如致谢）不会。

仅为上下文而跟随的 Thread 仍会送达消息，但不会让 Ticket 拥有人类后续消息，也不会恢复已结束的 Ticket。那些消息可以被独立评估。

当有活跃 Ticket 订阅时，Source 会轮询订阅的 Thread；在最后一个 Trigger 和订阅 Ticket 结束两者中较晚者之后，还会继续轮询两周。之后，消息只通过普通的接收途径到达：GitHub 通知或飞书实时事件。

## 失败与恢复

### Executor 受阻或失败

当 Executor Session 报告 `blocked` 或 `failed`，或者启动失败或出错（会记录为 `failed`）时，Ticket 不再接收自动 Input。

模型提供方或网络的暂时性故障（HTTP 408、429 或 5xx，或者连接被拒绝、重置或超时）会先重试三次，退避时间逐次增加：启动会重新运行，本轮失败的 worker 会被告知继续；失败的准备命令不会重试。

一旦失败，CI 和机器人消息会被记录在它上面，但不会送达，也不会唤醒 Session。

它的工具保持可用，所以人可以直接在 Session 中继续。

失败的启动不会自己重试。

人的消息、之后一个既不是 `blocked` 也不是 `failed` 的 Report，或一次重试，会结束这种暂停。

它是根据存储的 Report 和 Input 推算出来的，所以重启后依然保持。
### 重试

当未结束的 Ticket 处于 `person / delivery`、`person / blocked` 或 `person / failed` 时可用：对每种情况，补救办法都是一个新的 Assignment，它会重新启动 worker 并接收等待中的 Input。

一旦某人的消息送达了一个受阻或失败的 Ticket，Executor 就拿到了这条消息，所以 Ticket 显示为工作中（或者当失败的启动重新开始时显示为排队中），并且不提供重试，除非送达那条消息失败了。

重试会结束当前的 Assignment，并在同一个 Executor Session、目录、分支和 pull request 中开始一个新的。

Executor 模型只在创建 Session 时生效；已有的 Session 保留其模型。
### 重启

正在运行的 Assignment 以"宿主已重启"结束，新的 Assignment 带着一条恢复说明开始，告诉 Executor 在重复任何外部操作之前，先检查其目录、git 历史和 GitHub，最早的 Ticket 优先。

处于等待、就绪、受阻或失败状态的 Assignment 保持原样，除非在那次 Report 之后有 Input 送达，那种情况下它们也会重新开始。

Session、目录、Subscription、待处理的消息和下面所说的存储工作都会在重启后保留，记录每个 Executor Session 将哪些消息纳入其历史的记录也会保留（一个步骤在认领消息之后、调用模型之前完成纳入）：被重启打断的某轮所纳入的消息，在之后有 Report 或一轮结束时算作已读；而某个步骤认领了、但在纳入历史之前被取消或出错打断的消息算作未读。

重试或重启会把送达被替代 Assignment、但其 Executor Session 没有纳入的消息（可能被取消或被打断的步骤丢掉了）再交给新的 Assignment；仍在 Session 中等待的副本（被重启保留，或在崩溃后被持久化）会在新 Assignment 的第一条消息之前被取出，所以新的送达是唯一的副本。
### 存储的工作

dsh-superagent 在做出决定之后要做的事，例如把候选、后续消息或报告转发给主 Session、启动 Assignment 或送达 Input，都会先存储，之后再执行。

失败的转发或送达（例如其 Session 无法访问时）会在 2 秒后重试，之后的延迟逐次翻倍，最多一分钟；失败的启动会使其 Ticket 失败，除非是上文所说的暂时性故障。

每类工作只有在某一项连续失败三次之后，才会在概览的系统问题中报告一个错误；失败的 Input 送达则显示在其 Ticket 上。

转发给主 Session 的消息保持顺序，通知也是；失败的一条会挡住同类之后的消息。
### Source 失败

GitHub Source 单独读取每个 Issue、pull request 和 Thread：失败的读取会把错误保留在其 Thread 上，在下一次轮询时再读，并计入 Source 的错误；默认在连续三次轮询失败后报告该错误；任何一次成功的轮询都会重置计数。

当 agent 失去对某个私有仓库的访问权限时，GitHub 也会返回 404，所以 404 会被重试。

一个被通知的 Issue 或 pull request 如果读取一直失败，会在首次读取失败一天后被丢弃；如果 GitHub 报告它已被删除，则立即丢弃；之后它不再导致轮询失败，其 Thread 保留错误，Source 的状态会点名它。

它的读取位置保持不变，所以之后的通知或对其 Thread 的轮询会读到失败读取所遗漏的内容。

飞书事件消费者会报告每一次失败，对订阅话题的轮询会把每次失败保留在其 Thread 上。

GitHub 列表或飞书页面中格式错误的条目会被跳过，Source 的状态会对其计数。
### Channel 失败

外发消息会被存储并作为存储的工作发送，按从 5 秒开始、逐次翻倍、最多 300 秒的退避重试。

一个 Ticket 发往同一个对话的消息按排队顺序发出，所以它的确认会在之后的回答或结果之前：当同一 Ticket 发往同一对话的更早一条消息还没发出时，这条消息会等待，直到那条连续失败三次并显示为问题。

其他 Ticket 的消息，以及不属于任何 Ticket 的消息，不会等它。

有失败尝试的消息在发出或被撤回之前都是一个系统问题。

只有当其 Source 不再监听该对话，或 Source 回答说该对话永远无法接收它时，消息才会被丢弃；当其 Source 关闭时，它会等待。

对于 GitHub 上已删除的 Issue 或已锁定的对话，以及飞书上已撤回或飞书再也找不到的消息，Source 会给出这样的回答。

对一条已不存在的评审评论的回复，会改发到 pull request 的对话中。

被丢弃的消息保留其记录，包括何时、为何被丢弃以及它属于哪个 Ticket，所以它永远不会被再次排队；被丢弃的确认显示为已丢弃，而不是已发送。
### 暂停处理

停止分派、新的 Eval、Eval 超时、Input 送达和回复；已经在进行中的启动会等到处理恢复。

Source 继续记录 Trigger，正在运行的 Executor 轮次不会被打断。

人发给已结束 Ticket 的消息会等待：暂停后的第一次处理会恢复该 Ticket，前提是届时其 Mandate 在 Policy 下仍然成立。

进行中的 Eval 在暂停期间不会过期；它的截止时间会顺延暂停的时长。
### 无效配置

一个被其 kind 拒绝的已存储 Source 配置，会禁用该 Source 实例。
