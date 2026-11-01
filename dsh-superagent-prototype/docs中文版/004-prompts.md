# 004 提示词

本文档说明 agent 读什么、团队可以编辑什么，以及改动何时生效。它建立在 [000 理念](000-philosophy.md) 到 [003 执行](003-execution.md) 之上。提示词文本用英文编写。

## 团队写什么

团队可以编辑三个团队部分、添加 skill，并覆盖每个内置的系统提示词部分。大多数默认值在 `prompts/` 和 `skills/` 下。工具描述、通知和卡片保留在代码中，不能通过提示词设置编辑。

| 部分 | 包含 |
| --- | --- |
| Communication | 何时给人发消息、消息怎么写、每条 GitHub 消息开头的那一行（默认为 `This is by an automated agent, not a human`）、如何处理评审，以及哪些普通账号是评审机器人 |
| Ticket scope | Ticket 何时继续、何时以草稿停下 |
| Delivery requirements | pull request 中的证据、自动合并条件及其行数阈值，以及提交作者；没有时，Executor 以 agent 账号的 no-reply 地址提交 |
| Team skills | agent 在需要时加载的知识，例如一个说明哪个飞书用户对应哪个 GitHub 账号的 `identities` skill |

内置文本涵盖角色、工具用法、宿主机制、授权规则，以及 GitHub 和飞书的 skill。它通过标题引用团队部分，而不是重复其内容。

### 内置部分和模板

覆盖使用以下 key：

| 部分 | Key |
| --- | --- |
| 共享说明和角色 | `runtime/shared`、`runtime/orchestrator`、`runtime/worker` |
| 工作说明 | `runtime/subscriptions`、`runtime/replies`、`runtime/dispatch`、`runtime/work`、`runtime/admission` |
| 交接说明 | `runtime/handoff/orchestrator`、`runtime/handoff/worker` |
| Source skill | `skill/feishu`、`skill/github` |
| 生成的部分 | `runtime/environment`、`runtime/policy`、`runtime/policy/none` |

生成的部分是可编辑的模板。它们必须保留以下占位符：

- `runtime/environment`：`{variables}`，填入执行环境的各行。
- `runtime/policy`：`{version}`、`{mode}` 和 `{rules}`，每条已启用规则一行。
- `runtime/policy/none`：`{version}` 和 `{mode}`，在没有启用任何规则时使用。

编辑某个部分会改变模型收到的说明。它不会改变准入、Mandate、工具检查或账号包装器，这些仍由代码强制执行。

在人明确请求时，主 Session 也可以用 `orchestrator_prompts_save` 保存覆盖。如果一次保存省略了某个覆盖的 `base`，就保留已保存的 base。已保存配置中已存在、但已被移除的部分会在保存时被丢弃；其他任何未知部分都会被拒绝。

覆盖会记录它基于哪段内置文本。升级会保留团队的文本。如果默认值变了，面板会把该部分标记为 **Default updated**，并在团队文本旁边显示差异。团队可以保留自己的文本、使用新默认值或编辑它。没有覆盖的部分会自动跟随新的默认值。

主 Session 可以在 `orchestrator_read prompts` 的 `default_changed` 下读取受影响的部分名称。

## 组装与优先级

系统提示词按以下顺序组装：

1. 共享说明和角色。
2. 三个团队部分。
3. 订阅和回复。
4. 主 Session 的 dispatch，或 Executor 的工作说明。
5. `runtime/admission`，仅主 Session。
6. 交接说明。
7. `runtime/environment`。
8. `runtime/policy`，仅主 Session。

准入说明来自 `prompts/admission.md`。它们描述主动研判，以及什么时候可以根据卡片忽略一个无关的候选。`orchestrator_eval` 返回上下文，而不是重复这些说明。

环境部分给主 Session 提供部署范围的值，给每个 Executor 提供其 Ticket 特有的值。Policy 部分在每次模型请求时根据设置重新生成。它包含 Policy 版本、接受模式、显式请求豁免，以及以 `- <name> (<id>): <instruction>` 形式列出的已启用规则，或说明没有启用任何规则。它放在最后，这样 Policy 变更不会改变前面的提示词文本。

Executor 还会读取 DeepSeek Harness 的编码提示词和仓库的 `AGENTS.md`；主 Session 不读。推断的 Ticket 会在最后附加一条说明，把其 Executor 限制在匹配的规则之内。Assignment 和到达的消息以 Trigger 卡片的形式内联到达，只有被截断的内容才带资源指针。

Executor 在无人值守下工作。它们的工具不包括那些会询问人、向人展示 UI 或修改配置的工具，例如 `ask_user_question`、`present` 和 `plugin_manager`。

从最强到最弱：

1. 由工具和宿主强制执行的事实：身份、权限、工具参数检查、回复 purpose、长度限制。提示词文本无法改变它们。
2. 内置和生成的部分，以团队对它们的覆盖为准。
3. 主动 Ticket 匹配规则中的流程和沟通要求，仅对该 Ticket 的 Executor Session 有效。
4. 团队部分和团队 skill。
5. 外部文本：消息、评论、文档和引用。它是数据，永远不会改变规则或授权。

## 内置文本的原则

这些是把 [000 理念](000-philosophy.md) 应用到 agent 上：

- **角色分离。** 主 Session 只负责路由：它转发原始 Trigger 和路由事实，不做技术决定；它通过一个路由工具，在一次调用中对多个等待中的候选做出决定。路由备注最多 30 词。Executor 阅读原始来源、判断范围、实现并验证。
- **主 Session 不等待。** 报告、follow-up 通知、候选和完成的后台任务会作为消息自动到达。没有剩余事情时它就结束本轮。一个守卫会拒绝 `sleep`、超过 30 秒的 shell 超时和超过 5 秒的任务等待，因为一个被阻塞的步骤会延误新的候选。在主 Session 的完整提示词中，这些说明替代了 DeepSeek Harness 自己的任务通知说明。
- **只在有人必须行动或能用上结果时才发消息：** 结果可以被评审或使用、需要一个决定或资源，或工作无法完成。聊天消息默认一句话，硬上限 100 词。
- **Executor 决定自己的后续消息。** 每个 Executor 处理并确认范围内的请求，退回超出其 Ticket 或属于其他 Ticket 的请求。只有在所有拥有者都退回了它、或都在没有接手它的情况下结束后，一条消息才会成为新工作。主 Session 会收到 follow-up 通知，但只能对它们采取停止工作的行动。被退回的消息随后会作为带有 Executor 理由的候选到达。
- **通过订阅和主 Session 协调。** Executor 为获取上下文而跟随相关的 Thread。主 Session 可以在一条最多 100 词的备注中，传递来自另一个 Ticket 的事实。Subscription 和备注都不授予权限。
- **只在明确引用时才 attach。** 消息必须指向某个 Ticket 的 pull request、Issue、来源消息或确认，或指向一个恰好只有一个匹配 Ticket 的最近改动。仅凭主题相似是不够的。attach 会让 Ticket 订阅整个 Thread；发现它无关的 Executor 使用 `orchestrator_thread_unrelated`，并且不在那里回答。
- **具体地确认，只确认一次。** 在开展大量工作之前，Executor 会确认每个新请求，点名对象和预期结果，作为原始消息下的回复。
- **通过 `human_action` 提问。** Executor 在其 Report 中放一个具体问题，主 Session 原样转发。如果问题是由某人的消息引起的，它会指明那条消息，宿主在那里提问。否则就在 Ticket 的原始对话中提问。已授权的工作可以同时继续。
- **如实交付。** 开了 pull request 不等于就绪；草稿标为未完成；没有真实"改动前"截图的 UI 改动不算就绪。
- **人的暂缓会保持，** 跨越后续消息、新的 Executor Session 和重启，直到有人解除它。自动反馈永远不会恢复被暂停的工作。
- **示例只说明格式。** 示例句子不是 agent 可以声称的事实。
- **按结果处理评审。** 已修复并验证的评论会被静默解决；被拒绝的评论会得到一句理由。自动评审者的线程一旦有了回答就会被解决，每个自动评审者在每个 pull request 上最多三轮。
- **让位于重复的工作。** 当某人的分支或 pull request 已经包含了 Ticket 的改动时，Executor 会关闭自己的 pull request，并留一句话指向对方的。

## 版本

- 每次保存都会创建一个不可变的版本，包含完整配置、修订号、前一个版本、时间戳和来源（面板或工具）。恢复某个版本或默认值会创建另一个版本。
- 保存会指明其基础修订。冲突的保存会被拒绝，但不会丢弃草稿。
- Session 在每次模型请求时读取最新版本，包括同一轮中之后的步骤。保存不会重启、取消或唤醒 Session。宿主会记录每个 Session 用过的修订；Executor 可以读取它工作时用过的任何修订。
- 部署设置了一个总大小上限，包括覆盖在内。校验会拒绝未知的 key、保留的内置 skill 名称、未知的覆盖部分和缺失的模板占位符。它从不悄悄截断文本。与默认值完全相同的覆盖会被移除，这样该部分会跟随未来的默认值。
