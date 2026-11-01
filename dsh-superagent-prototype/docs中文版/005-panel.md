# 005 面板

在 DeepSeek Harness Web 侧边栏中打开 **Superagent** 来监督 agent。面板优先显示需要人处理的工作，然后是系统健康状况和历史。本文档建立在 [000 理念](000-philosophy.md) 到 [004 提示词](004-prompts.md) 之上。

## 三个问题

打开面板时，它按以下顺序回答三个问题：

1. 现在有什么需要我处理吗？
2. 系统健康吗，在做正确的事吗？
3. 某项工作从 Trigger 经过 Eval 到 Ticket 的历史是怎样的？

## 标签页

标签页按工作流程排列：**Overview**、**Source**、**Trigger**、**Eval**、**Execution** 和 **Settings**。在仓库和账号设置成功之前，Overview 会显示缺什么，并链接到相关设置。

| 标签页 | 显示 |
| --- | --- |
| Overview | 需要处理的 Ticket、系统问题、过去 24 小时的活动计数和 Executor 负载。每个区块都链接到其详细页面 |
| Source | Source 状态、设置问题和非零计数。被过滤的 Trigger 和被丢弃的消息与 Overview 覆盖同样的 24 小时窗口 |
| Trigger | 按"已订阅""评估中""24 小时内有新 Trigger"或"全部 Thread"过滤的 Thread。每个 Thread 显示其 Trigger（最新的在前）、Decision 和 Subscription |
| Eval | Decision 及其理由和匹配的规则 |
| Execution | Executor 状态、暂停处理，以及按"未结束""待启动""工作中""等待 Trigger"或"已结束"过滤的 Ticket。Ticket 详情显示操作、授权、等待中的 Input、Subscription 和 Assignment |
| Settings | Sources、Eval、Execution、Prompts 和 Deployment。每组都包含其保存历史 |

### 阅读单条记录

被丢弃的消息会链接到其 Ticket，没有 Ticket 时链接到其 Thread。Source 页面会说明是它的对话消失了，还是 Source 不再监听它了。

仍被 Executor 拥有的人类后续消息会标为 **Delivered to Ticket**，没有 Eval。Thread 还会显示退回理由和仅作上下文的 Subscription。**Evaluate again** 可以把这条后续消息送去 Eval，或者重试一个没有有效判断的 Trigger：被其 Source 过滤的、Eval 为 unavailable 的，或已送达但既没有非 stop 的 Decision、也没有 Executor 确认的消息。

Ticket 详情显示起始 Trigger、Decision 和理由、范围以及 Policy 版本。Assignment 和次要细节折叠在即时操作下方。当 Input 送达失败，或 Ticket 在受阻或失败的 Report 之后等待人时，可以使用 **Retry**。已结束的 Ticket 会显示结果，例如 **Pull request merged** 或 **Stopped by a person**。

## 设置组

- **Sources：** 每个 Source 一张卡片，带有其开关、字段和已验证的账号信息。GitHub 还为新 Issue、pull request、评论和默认分支 CI 提供"接收全部"开关。轮询和读取限制在 Advanced 下。
- **Eval：** Policy 版本和规则，之后是 **On each Source** 和 Eval 设置。每个 Source 标签页包含其允许名单、成员同步、准入表和机器人名单。同步在启动时和点击 **Sync now** 时运行。准入表区分接收范围、发送者是否在名单上，以及消息是否在对 agent 说话。Eval 设置用于选择接受模式、超时和研判模型。
- **Execution：** worker 模型、并发、目录根、准备命令和禁止的命令。点击一个可用变量会把它插入准备命令中。
- **Prompts：** **Edit** 修改团队部分、内置部分和 skill。**Full prompt** 显示组装后的文本，并与已保存的文本或默认值比较。**History** 列出版本。被编辑过的内置部分会标为已更改，可以重置；模板会列出其必需的占位符。

  一次修改了被覆盖默认值的升级，会把它标为 **Default updated**（默认内容已更新）。面板会在团队文本上方比较新旧默认值。如果没有记录旧默认值，就改为比较团队文本和新默认值。选择 **Keep my text** 或 **Use the new default**。已移除部分的覆盖会列在标签栏下方，并在下次保存时被丢弃。
- **Deployment：** 启动问题及 **Check again**、状态目录和机器限制。保存的限制无需重启即生效。DeepSeek Harness 插件管理器暴露同一个页面。

## 搜索

页头的搜索可以按文本、id、飞书消息 id 或存储的链接（例如 GitHub 评论 URL）查找 Trigger。原始消息中没有的飞书链接，只有在宿主于当前进程生命周期内读取过之后才能被搜索到。

搜索还可以按 `#12` 或 GitHub URL 这样的引用查找 Thread，按标题或匹配的 Thread 查找 Ticket。

## 原则

1. **聚焦重要的东西。** 每个元素都回答三个问题之一，否则就删除。数字只在它会改变监督者的行动时才出现。
2. **精确的定义。** 分类有可检查的定义、互斥并覆盖所有情况，就像 Ticket 阶段那样。标签说明某一行在等谁、需要什么，而不是一个内部状态码。
3. **一个概念一个位置。** Source 状态属于 Source；Thread 和 Trigger 属于 Trigger；Decision 属于 Eval；Ticket 属于 Execution。设置按其配置的概念分组。Overview 汇总这些页面并链接到它们，而不是成为另一个详细视图。
4. **领域结构。** 面板使用领域术语。内部标识符只出现在折叠的细节中，能解析时用名称代替标识符。
5. **如实的状态。** 计数等于它所链接列表的长度，没有任何状态与另一个事实矛盾。
6. **默认安静。** 健康状态不占额外空间。问题必须是可处理的；一次性的网络错误不够格。需要人处理的行直接提供其操作。页面说明控制在一句话，更多细节放在 (?) 提示中。破坏性操作需要确认。
7. **一致的控件。** 使用 DeepSeek Harness 的设计 token 和控件行为。同样的信息在整个面板中应该看起来一样。每个设置区块有一个保存栏，只在有改动、正在保存或保存失败时可见。
