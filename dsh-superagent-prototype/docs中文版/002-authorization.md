# 002 授权

授权决定谁可以发起工作，以及该工作可以包含什么。本文档建立在 [001 领域模型](001-domain.md) 之上。

宿主负责执行允许名单、规则和 Mandate。消息、评论和引用的文档是做决定的输入；它们不能改变这些权限。

## Trigger 的两条路径

### Eval：决定是否开始工作

Source 会记录一条消息是否在对 agent 说话：`mention` 表示 @ 了机器人或 agent 账号，`direct` 表示私信。准入（gate）检查发送者和该 Source 的 Policy：

- 允许名单上的人对 agent 说话，构成一个显式请求。
- 某人在有 Ticket 的 Thread 上的后续消息，遵循下面的规则。
- 其他人类消息使用其接收范围对应的准入表。
- 在该 Source 机器人名单上的机器人可以产生推断候选，但永远不能产生显式请求。其他机器人不被准入。

### Subscription：继续已有的工作

订阅 Thread 上的每条消息都会作为上下文送达其订阅的 Ticket，包括来自机器人和 CI 的消息。这种送达绕过准入，也不授予任何新权限。每个 Ticket 仍受其 Mandate 限制。

某人在 Ticket 自己的 Thread 上的消息，由该 Ticket 的 Executor 决定如何处理。主 Session 把一条消息挂到某个 Ticket 上时也是如此。当 Executor 拥有这条消息时，它不经过 Eval，也没有 Decision。每个 Executor 要么在其 Ticket 范围内处理该请求，要么把它退回，以便路由到别处。

只要 Ticket 还活跃，所有权就持续存在，即使有人删除了它的 Subscription。它也覆盖一个已结束、不是被人停止、且有这条消息等着恢复它的 Ticket。

主 Session 会收到一条 follow-up 通知。当 Executor 拥有这条消息时，主 Session 只能按此人的要求停止工作；accept、attach、ignore 和 requeue 都会被拒绝。stop 仍要以下文所述的 follow-up 强度通过准入。

### 退回与释放后续消息

当一条消息要求超出 Ticket 范围的工作，或属于另一个 Ticket 时，Executor 会把它退回一次。Ticket 保留其 Subscription。如果一个被挂上来的 Thread 无关，Executor 会退回它在那里拥有的消息。

只有在没有任何 Ticket 仍然拥有一条消息之后，它才会进入新的 Eval。它的候选包含各 Executor 给出的理由。准入把它当作该 Thread 上的普通消息来判断，主 Session 可以接受它、挂到别处或忽略它。退回一条 Ticket 并不拥有的消息（例如机器人消息，或某人已经送去 Eval 的消息）不会排入任何东西。

Ticket 结束时，会释放其 Executor 没有读取或接手的后续消息。这些包括从未送达 Executor 的消息，以及在其最后一次 Report 或本轮结束之后送达、且它既没有确认、回答也没有退回的消息。每条被释放的消息在没有其他 Ticket 拥有它时进入 Eval。stop 只结束被停止的那个 Ticket 的工作。

被停止的 Ticket 不会把它的停止消息再次送去 Eval，除非另一个 Ticket 把它退回了。停止它的主 Session 可以把消息的其余部分作为新工作接受。

人可以在面板上把一条被拥有的后续消息送去 Eval。如果主 Session 随后又把它挂回一个活跃的 Ticket，Executor 会再次收到它。当没有有效的判断覆盖某条消息时，面板也会提供重新评估。

### 仅作上下文的订阅

Executor 可以为获取上下文而跟随一个相关的 Thread，例如另一个 Issue 或 pull request。那里的消息会送达 Ticket，但不授予任何权限或 follow-up 强度。那里的人类消息不会恢复一个已结束的 Ticket，除非主 Session 把来自该 Thread 的消息挂上来。主 Session 关于其他工作的备注也只是上下文。

没有送达任何 Ticket 的人类消息，包括那些 Ticket 都被人停止了的 Thread 上的消息，走 Eval 路径。机器人消息走这条路径，与它们是否送达订阅 Ticket 无关。

## 强度

| 强度 | 情形 |
| --- | --- |
| explicit | 名单上的人对 agent 说话，或在已有 Ticket 的 Thread 上发后续消息；准入表中设为显式请求的单元格 |
| inferred | 不在名单上的人在有 Ticket 的 Thread 上发后续消息，除非其在准入表中对应的单元格是 explicit；准入表中设为推断候选的单元格；在该 Source 机器人名单上的机器人对 agent 说话、或在 Source 接收所有消息的地方发的消息 |
| 不准入 | 其他任何机器人的消息、准入表忽略的所有内容，以及接受模式为 `off` 时的所有推断情形 |

对于不在名单上的人，即使在有 Ticket 的 Thread 上，显式准入单元格也优先，并且在所有接受模式下都有效。否则，其后续消息是推断的，在 `off` 模式下不被准入。仅为上下文而跟随的 Thread 上的消息使用准入表，而不是 follow-up 强度。

## 准入

每个 Source 的 Policy 都有一张准入表。它的行是接收范围：

- **飞书：** 每个已配置的群、机器人从中收到 @ 的其他群，以及私信。只有当飞书卡片上的 **其他群** 设为 **仅 @** 时，才会接收其他群。
- **GitHub：** 新 Issue、新 pull request、评论和默认分支的 CI。

一行最多有三个单元格。每个单元格决定一条消息成为显式请求、推断候选，还是什么都不是：

| 单元格 | 可选项 | 默认值 |
| --- | --- | --- |
| 在名单上，未对 agent 说话 | inferred、ignore | inferred |
| 不在名单上，对 agent 说话 | explicit、inferred、ignore | ignore |
| 不在名单上，未对 agent 说话 | inferred、ignore | ignore |

未对 agent 说话的消息对应的单元格，只在 Source 接收所有消息的地方可用，例如设为 **全部消息** 的飞书群，或开启了"接收全部"开关的 GitHub 范围。CI 结果没有发送者，所以它那一行只提供最后一个单元格。机器人消息使用机器人名单，而不是这些单元格。

把"不在名单上、对 agent 说话"的单元格设为 explicit，可以让该范围内的任何人通过 @ agent 来请求工作。这对专门的支持群可能有用。推断候选仍取决于接受模式。后续消息通常绕过这张表，但显式单元格仍会授予显式强度。

准入表是 Policy 版本的一部分。削弱某个单元格不会立即停止据此接受的未结束 Ticket。在它们恢复前重新验证时，可能会撤销其 Mandate。

### 机器人和自动评审者

宿主会把 GitHub App、以 `[bot]` 结尾的登录名和飞书机器人识别为机器人。Source 可以列出像 `dependabot[bot]` 这样的机器人，其消息可以成为推断候选。它们必须要么对 agent 说话，要么在接收所有消息的范围内发帖。它们不能发出显式请求，也不能停止 Ticket。

使用普通账号的自动评审者，对宿主来说算作人。它的评论会送达订阅的 Ticket，并产生 follow-up 通知。团队提示词文本必须把这类账号标明为自动评审者。

## 路由候选

主 Session 用 `orchestrator_route` 路由显式候选。一次调用可以包含多个 accept、attach、stop 或 ignore 决定。每一项独立处理：某项被拒绝或缺少字段，不会妨碍其他项执行。

推断候选通常需要完整的研判。有一个捷径：如果它的卡片明显不涉及任何已启用规则，例如闲聊或无关讨论，主 Session 可以直接忽略它。Decision 会记录 `ignoredFromCard`，以区别于规则研判。主 Session 在其 Policy 提示词部分读取已启用的规则。

接受推断候选总是需要研判。直接 accept 会拒绝准入没有判为显式的 Trigger。

## 接受模式和规则

接受模式是 Policy 的一部分：

| 模式 | 效果 |
| --- | --- |
| `off` | 任何推断的东西都不会成为候选，例如未对 agent 说话的消息、机器人的消息，或不在名单上的人的后续消息 |
| `observe`（默认） | 推断候选会被研判；正向研判会被记录为标注"本会接受"的 ignore，不接受任何东西 |
| `auto` | 推断候选的正向研判会接受它 |

显式请求在所有模式下都有效。从 `observe` 开始，审阅记录下来的 Decision 之后再切换到 `auto`。每次研判都对每条已启用规则恰好判断一次，无论是否匹配。主动接受至少需要一条匹配的规则。

每条规则描述一类主动工作。Ticket 的 Mandate 记录匹配的规则，其 Executor 会收到这些规则的名称和说明。

对该 Ticket 而言，规则中的流程和沟通要求会覆盖默认值。一条静默规则可以不发确认；一条评审规则可以指定合并前必需的评审者和批准。适用于每个 Ticket 的要求则应写在团队提示词部分。

## Policy 版本

规则、接受模式和每个 Source 的 Policy 构成 Policy 版本。每个 Mandate 都记录它被接受时所依据的版本。

版本变更会丢弃正在运行的 Eval，并把它们的 Trigger 重新排队。它还会向每个受影响的活跃 Ticket 发送一条 policy-changed Input。这条 Input 会说明：

- 某条匹配的规则变了（附其新文本），或不再适用；
- 请求者不能再发起工作；或
- 不再接受主动工作，例如因为模式从 `auto` 改了。

未受影响的 Ticket 不会收到通知。变更不会立即撤销活跃 Ticket 的 Mandate。

Source 配置与 Policy 是分开的。它控制什么进入系统：读取哪些群，以及某个范围是接收所有消息还是只接收 @。Mandate 会记录其 Source 和接收范围。恢复需要 Source 仍在监听该 Thread，但不要求它仍接收那里的所有消息。

Source 关闭时，回复会等待。如果 Source 不再监听其目的地，回复会被丢弃。

关于 Executor 可以如何处理自己结果的条件，例如何时可以合并，并不决定谁可以授权工作。它属于 agent 的说明，不属于 Policy。

## 恢复与停止

已结束的 Ticket 保留其 Mandate。某人在其自己的某个 Thread 上的消息可以恢复同一项工作，无需新的 Eval 或 Decision，不管是谁发的。机器人和 CI 不会唤醒已结束的 Ticket。Executor 决定该请求是否符合范围，不符合就结束本轮。

只有三种操作会改变 Mandate：accept 创建它，人的 stop 收回它，重新验证失败会撤销它。被人停止的 Ticket 保持结束状态，不再接收任何东西。在那里请求的工作需要一次新的 accept。

### 恢复前的重新验证

Source 必须仍在监听原始 Thread。其余检查取决于 Mandate 的依据：

- 显式的 follow-up Mandate 直接通过。
- 推断的 Mandate 需要 `auto` 模式，且其匹配的规则仍处于启用状态。
- 由表格单元格准入的 Mandate，在今天的表格和发送者名单身份下，必须仍至少获得其原始强度。因此，把发送者从名单中移除，可能会撤销通过"在名单上"单元格接受的 Mandate。
- 机器人的 Mandate 要求该机器人仍在 Source 的机器人名单上。推断的表格 Mandate 和机器人 Mandate 还需要 `auto` 模式和已启用的匹配规则。
- 其他 Mandate 要求发送者仍在 Source 的允许名单上。

如果重新验证失败，Ticket 保持结束状态，不接收任何等待中的消息。每条消息都被视为没有送达任何 Ticket；如果没有其他 Ticket 拥有它，它就进入 Eval。主 Session 不会被告知它曾送达某个 worker。这在处理暂停之后同样适用。挂到该 Ticket 会被拒绝，后续工作需要一次新的 accept。

- **某人在 Thread 中说"停"是一个普通的 Trigger，** 由 Eval 决定 stop。Executor 不能声明有人要求它停止。
- **面板上的停止是一条命令。** 它直接作用于 Ticket，并被记录为手动停止。
- **等待条件属于 Source。** 像"N 小时内没有指派人"这样的条件，会是一个自己等待并再次检查的 Source；Eval 从不等待。

## Eval 没有完成时

时间限制从候选到达主 Session 时开始计算。等待送达的时间不计入，未送达的候选永远不会过期。

过期的 Eval 会把其 Trigger 排队重试。连续重试两次后，第三次过期会记录 `unavailable`。研判失败也会记录 `unavailable`；之后的 Trigger 可以开始一次新的 Eval。Policy 变更，或依据过时 Policy 做出的决定，会记录 `unavailable`，并立即在当前版本下重新排入该批次。

`evals` 健康条目会报告过去一小时内未解决的 unavailable Decision。`scripts/dsh-superagent status` 包含该错误。

只有当 unavailable Decision 不到 24 小时、仍是其 Thread 上最新的 Decision、未被忽略、且该 Thread 既不在排队也不在评估中时，面板才会请求人工关注。人可以重新评估该 Trigger，或忽略这个问题。
