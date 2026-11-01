# 008 实践手册

本手册展示如何扩展 dsh-superagent。它使用 [001 领域模型](001-domain.md) 和 [002 授权](002-authorization.md) 中的术语，以及 [007 架构](007-architecture.md) 中的组件。

## 添加一个 Source

本示例实现一个名为 `webhook` 的 Source kind。它通过一个虚构的 CLI `hookq` 读取一个假想的消息队列，并把消息转换成 Trigger。其他所有接口都是 dsh-superagent 的一部分。

实现有四项职责：翻译事件、定义接收和授权规则、提供回复和上下文，以及维护一个轮询循环。下面编号的步骤按顺序构建这些部分。

示例假设这个 CLI 约定：

- `hookq pull --after <n> --json` 打印位置 `n` 之后的消息，最早的在前：`{"me": "<the agent's id on the queue>", "items": […], "next": <position>}`。每条 item 有 `id`、`conversation`、`thread`（开启其线程的那条消息的 id，在那条消息本身上不存在）、带 `id` 和 `bot` 的 `sender`、`mentions_me`、`text`、`at` 和 `url`。
- `hookq reply --conversation <id> --to <message id> --key <key> --text <text>` 在一条消息下回复，每个 key 只回复一次。对于已删除的对话，它会失败，并在标准错误上输出 `{"error": {"code": 410, "message": "…"}}`。
- `hookq thread --conversation <id> --root <message id> --json`（用 `--after <cursor>` 获取后面的页）打印一个线程的一页，最早的在前：`{"items": […], "next": "<cursor>"}`，最后一页没有 `next`。

把 kind 及其插件入口放在 `src/sources/webhook.ts` 中，参照 `src/sources/github.ts`。如果 Source 变大了，就像飞书 Source 那样，把翻译、Channel 和轮询代码拆分到单独的模块中。

### 1. 把事件映射到领域

在写代码之前选好稳定的映射。Trigger id、Thread id 和 Channel 地址都会被持久化，所以之后再改可能会让已有记录断开关联。

| 概念 | 对于 webhook 队列 |
| --- | --- |
| Trigger | 一条消息 |
| Thread | 一个对话中的一条消息及其回复：`<conversation>:<id of the first message>` |
| Actor | 发送者在队列上的 id，与允许名单中的名称一致 |
| Channel 地址 | 对话，以及回复挂在其下的那条消息 |
| 接收范围 | 一个对话，在准入表中有它自己的一行 |

### 2. 配置：schema、字段、事实和健康

模块导入下面各步骤用到的内容：

```ts
import type { Context } from '@deepseek-ai/cordis'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import { key, threadKey, type OutboundMessage, type Trigger } from '../core/index.ts'
import { CliError } from '../infra/commands.ts'
import { KV } from '../kv.ts'
import { health, sourceContext, type SourceContext } from './host.ts'
import type { SourceKind } from './kind.ts'
```

```ts
const ConfigSchema = z.object({
  conversations: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    listen: z.enum(['mentions', 'all']),
  }).strict()).default([]),
  pollSeconds: z.number().int().min(10).max(3600).default(30),
}).strict()
export type WebhookConfig = z.infer<typeof ConfigSchema>

export const webhookKind: SourceKind<WebhookConfig> = {
  kind: 'webhook',
  title: { zh: 'Webhook 队列', en: 'Webhook queue' },
  description: { zh: '接收 webhook 队列里下列对话的消息。', en: 'Receives the messages of these conversations from the webhook queue.' },
  schema: ConfigSchema,
  fields: [
    { key: 'conversations', type: 'rows', label: { zh: '接收的对话', en: 'Conversations' }, columns: [
      { key: 'id', type: 'text', label: { zh: '对话', en: 'Conversation' }, pattern: '[a-z0-9-]+' },
      { key: 'listen', type: 'select', label: { zh: '接收', en: 'Receive' }, options: [
        { value: 'mentions', label: { zh: '仅 @', en: '@ only' } }, { value: 'all', label: { zh: '全部消息', en: 'All' } }] },
    ] },
    { key: 'pollSeconds', type: 'number', advanced: true, min: 10, max: 3600,
      label: { zh: '轮询间隔 / 秒', en: 'Polling interval / seconds' } },
  ],
  health: ['webhook'],
  // find, scope, channel, threadContext, policy and environment follow in the next steps.
}
```

- `kind` 是稳定的 Source id。它出现在 Trigger 的 `source`、Thread key 前缀、`source:webhook` 设置区块和 Source Policy 中。
- `schema` 校验存储的配置并提供默认值。在操作者保存实例之前，注册表会用这些默认值创建一个启用的实例。让默认值什么都不接收；本例默认没有任何对话。
- `fields` 生成 Source 设置表单，无需自定义面板代码。`rows` 字段编辑以其第一列为 key 的条目；`advanced` 隐藏不常用的设置。如果 Source 能把 id 解析为显示名称，就实现 `refreshLabels`。把这些名称保存在 `KV.sources.labels(kind)` 下。带 `choose` 和 `refresh` 的列就可以提供它们。
- 可选的 `facts(deployment)` 显示由设置检查推导出的值，例如某个 CLI 背后的账号。设置检查目前只检查 `SETUP_FIELDS` 中列出的 GitHub 和飞书字段，所以本例不提供 facts。
- `health` 声明 Source 的健康条目，初始为 `starting`。注册时会认领每个名称，并拒绝与 `runtime`、`reply`、`worker` 或 effect 类型等条目冲突。使用 kind 的名称，并把 `sync:<id>` 留给 Policy 同步。`error` 会让状态脚本以 2 退出，并让每小时检查通知操作者，所以只在可能需要人采取行动时才报告它。

### 3. 把消息翻译成 Trigger

在转换之前先校验 CLI 的响应：

```ts
/** One message as `hookq pull` and `hookq thread` print it. */
const MessageSchema = z.looseObject({
  id: z.string().min(1), conversation: z.string().min(1), thread: z.string().optional(),
  sender: z.looseObject({ id: z.string(), bot: z.boolean().default(false) }), mentions_me: z.boolean().default(false),
  text: z.string(), at: z.string(), url: z.string().optional(),
})
type QueueMessage = z.infer<typeof MessageSchema>
/** The answer of `hookq pull`, whose items are read one by one, and of `hookq thread`. */
const PageSchema = z.looseObject({ me: z.string(), items: z.array(z.unknown()), next: z.number().int() })
const ThreadPageSchema = z.looseObject({ items: z.array(MessageSchema), next: z.string().optional() })
```

```ts
/** The Trigger of one queue message; the agent's own messages produce none. */
export function webhookTrigger(message: QueueMessage, me: string): Trigger | undefined {
  if (message.sender.id === me) return undefined
  const thread = `${message.conversation}:${message.thread ?? message.id}`
  return {
    id: key('webhook', message.id),
    source: 'webhook',
    threads: [{ source: 'webhook', id: thread }],
    actor: { source: 'webhook', id: message.sender.id },
    human: !message.sender.bot,
    ...(message.mentions_me ? { addressed: 'mention' as const } : {}),
    at: message.at,
    text: message.text,
    channel: { source: 'webhook', thread: `webhook:${thread}`,
      address: { conversation: message.conversation, message: message.id, ...(message.url ? { url: message.url } : {}) } },
    ...(message.url ? { url: message.url } : {}),
    meta: { conversation: message.conversation, messageId: message.id, root: message.thread ?? message.id },
  }
}
```

- **稳定的 id。** 通过 `key` 从队列 id 推导出 Trigger id。对于已存储的 id，`Engine.receive` 返回 `duplicate`，重复的 accept 只会创建一个 Ticket。因此重新读取消息是安全的。如果要把编辑视为新事件，就把编辑版本包含在 id 中，就像 GitHub 对评论的 `updated_at` 所做的那样。
- **Thread。** 第一个 Thread 是主 Thread，拥有 Eval。其他 Thread 增加 Correlation 上下文。id 由 Source 选择；它的完整 key 是 `webhook:<id>`。
- **发送者。** 在 `actor` 中使用 Source 原生的 id。对机器人和 CI 设置 `human: false`。列出的机器人只能成为推断候选。空的 actor id（例如 CI）使用"不在名单上、未对 agent 说话"的准入单元格。只有当消息真的在对 agent 说话时，才把 `addressed` 设为 `mention` 或 `direct`；这会让允许的人的消息获得显式强度。永远不要为 agent 自己的消息产生 Trigger。
- **回复目的地和元数据。** `channel` 标识回复发往何处；`url` 链接到来源消息。`channel.thread` 把消息分组以便按序送达：一个 Ticket 之后的消息会排在其更早的消息之后等待，直到某条更早的消息失败三次。其他 Ticket 不会等待。把 Source 特有的字段放在 `meta` 中，例如接收的对话和 Thread 根。`meta` 和 `text` 都是不可信数据，不是授权。

agent 可以通过 `orchestrator_read trigger/<id>` 和 `thread/<key>` 读取新的 kind。它们会暴露消息文本、去向和相邻的 Trigger。新的 kind 不会自动获得内置 skill、原始服务记录的资源或 pull request 绑定。

文本搜索无需额外代码即可工作。当人们使用 Source 特有的引用（例如消息 id、URL 或 `#12`）时，实现 `find(query)`。返回这些引用所标识的 Thread key 和搜索词：

```ts
  find: query => ({ threads: [], terms: [...new Set(query.match(/\bm[0-9]+\b/g) ?? [])] }),
```

这里查询中的队列消息 id（例如 `m42`）会用来搜索对应的 Trigger。

### 4. Source 接收什么：scope

```ts
  scope({ meta }, config) {
    const conversation = config.conversations.find(item => item.id === meta.conversation)
    if (!conversation) return { listened: false, reason: 'conversation_not_listed' }
    return { listened: true, observed: conversation.listen === 'all', row: conversation.id }
  },
```

Engine 通过 `SourceRegistry` 对每个到来的 Trigger 调用 `scope`。范围之外的消息会连同原因被存储为已过滤，不会创建 Thread。把消息交给 `receive`，而不是在轮询循环中悄悄丢弃，这样面板才能解释过滤情况。

`observed: true` 表示 Source 在该范围内接收未对 agent 说话的消息，从而可以对它们做准入表决策。`row` 标识对应的准入行。

重新验证会用 Mandate 存储的元数据调用 `scope`。让它只依赖 `meta` 和配置。恢复需要 `listened`，而不需要 `observed`。没有 `scope` 时，kind 会接收它产生的每个 Trigger，但不 observe 任何一个。

### 5. 回复：Channel

```ts
  channel: {
    allowed: (address, config) => config.conversations.some(item => item.id === address.conversation),
    send: sendWebhook,
    link: address => ({ url: address.url ?? '',
      label: { zh: `Webhook 对话 ${address.conversation}`, en: `Webhook conversation ${address.conversation}` } }),
  },
```

```ts
export async function sendWebhook(host: Pick<SourceContext, 'commands'>, message: OutboundMessage): Promise<'sent' | 'gone'> {
  const { conversation, message: to } = message.channel.address
  if (!conversation || !to) throw new Error('Missing webhook reply target')
  try {
    await host.commands.run('hookq', ['reply', '--conversation', conversation, '--to', to, '--key', message.id,
      '--text', message.text])
    return 'sent'
  } catch (error) {
    if (error instanceof CliError && error.code === 410) return 'gone'
    throw error
  }
}
```

- **幂等的发送。** Outbox 调用 `SourceRegistry.send`，后者调用 `channel.send`。Source 插件未加载时，消息会等待。发送可能在远程服务已经收到之后才失败，所以重试不能产生重复消息。用 `message.id` 作为幂等 key：`hookq` 支持 `--key`；GitHub 存储一个隐藏的评论标记；飞书接受一个幂等 key。
- **永久失败与可重试失败。** 成功时返回 `sent`，只有在送达永远不可能时才返回 `gone`，例如示例中的 410。gone 的消息会作为已丢弃保留，永远不会再次排队；它会出现在 `GET sources` 和 Source 页面上。其他失败就抛出异常，这样 Outbox 会在 5 秒后重试，逐次翻倍到 300 秒。`CliError.code` 是 CLI 输出中报告的代码。
- **允许的目的地。** `allowed(address, config)` 只检查已保存的地址和当前配置。把每个必需的事实都放在地址中；例如，飞书会记录该群是否为私聊。不再被监听的目的地会被丢弃，而被禁用的 Source 会让消息等待。没有 `allowed` 时，只要 Source 启用，所有地址都被允许。
- **链接。** `link(address, links)` 返回面板通过 `SourceRegistry.link` 显示的 URL 和标签。

### 6. 供研判使用的 Thread 上下文

```ts
  threadContext: {
    messageId: trigger => String(trigger.meta.messageId ?? ''),
    // A queue thread is flat: its root, and the message a reply answers, are on its first page, as on GitHub.
    read: async (commands, trigger, _part, cursor) => {
      const page = ThreadPageSchema.parse(JSON.parse(await commands.run('hookq', ['thread', '--conversation',
        String(trigger.meta.conversation), '--root', String(trigger.meta.root), '--json', ...(cursor ? ['--after', cursor] : [])])))
      const messages = page.items.map(item => ({ id: item.id, from: item.sender.id, at: item.at, text: item.text,
        ...(item.sender.bot ? { bot: true as const } : {}), ...(item.url ? { url: item.url } : {}) }))
      return { messages, ...(page.next ? { next: page.next } : {}), body: { messages } }
    },
  },
```

主动研判需要 Trigger 周围的对话。`orchestrator_eval` 读取一个初始窗口；`orchestrator_eval_read` 展开更多页、根消息或父消息。实现可选的 `threadContext` 接口来提供这些读取：

- `read(commands, trigger, part, cursor, config)` 返回一个 `ContextPart`。它的 `messages` 使用 `ContextMessage`：`{id, from, at, text}`，加上适用的 `bot`、`deleted`、`reply_to`、`url`、`path` 和 `line` 字段。最后一页省略 `next`。`body` 是展示给进行研判的 Session 的内容，这里与 messages 相同。可选的 `status` 可以描述特殊结果，例如飞书的 `chat_neighbours`。`part` 是 `thread`、`root` 或 `parent`。
- `messageId(trigger)` 在其中找到该 Trigger 自己的消息。
- `images(text)` 和 `image(…)` 用于消息带图片的 kind，例如飞书；本例省略了它们。

没有 `threadContext` 的 kind 不给研判提供 Thread 上下文；Trigger 自己的文本仍然可读。

如果消息会回复更早的消息，就添加 `repliesTo(trigger)`。它返回对应的 Trigger id，让 follow-up 通知和 worker 的 Input 在被回复的消息已存储时显示它。例如，如果 `hookq` 提供 `reply_to`，并且翻译时把它存为 `meta.replyTo`：

```ts
  repliesTo: trigger => typeof trigger.meta.replyTo === 'string' ? key('webhook', trigger.meta.replyTo) : undefined,
```

### 7. 谁可以请求：Source 在 Policy 中的部分

```ts
  policy: {
    schema: z.object({ allowed: z.array(z.object({ id: z.string().min(1), name: z.string().trim().max(100).optional() }).strict())
      .default([]) }).strict(),
    fields: [{ key: 'allowed', type: 'rows', label: { zh: '能发起工作的发送者', en: 'Senders who may originate work' }, columns: [
      { key: 'id', type: 'text', label: { zh: '发送者', en: 'Sender' } },
      { key: 'name', type: 'text', label: { zh: '名字', en: 'Name' }, optional: true }] }],
    explicit: { zh: '名单里的人在消息里 @ 智能体。', en: 'Someone on the list mentions the agent in a message.' },
    rows: stored => ConfigSchema.parse(stored).conversations.map(conversation => {
      const all = conversation.listen === 'all'
      return { id: conversation.id, label: conversation.id, note: all ? { zh: '全部消息', en: 'All' } : { zh: '仅 @', en: '@ only' },
        cells: { listedUnaddressed: all, unlistedAddressed: true, unlistedUnaddressed: all } }
    }),
  },
```

- `schema` 校验 Source Policy，包括 `allowed` 中的发送者 id。id 比较不区分大小写。准入表单独校验，并在各 kind 之间共享。这一 Policy 部分保存在 `policy.sources.webhook`，并计入 Policy 版本。
- `fields` 生成 **Eval → On each Source** 下的表单，从 `allowed` 开始。`explicit` 说明如何对 agent 说话。可选的 `unnamed: {person, bot}` 为不透明的 id（例如飞书的 `ou_…`）提供显示标签；本例省略它，因为队列 id 本身就是可读的名称。
- `rows(config)` 列出准入范围及其可用的单元格。每行的 id 必须与 `scope` 返回的 `row` 匹配。未对 agent 说话的消息对应的单元格，只在 Source observe 这些消息的地方可用。没有 `rows` 的 kind 使用默认单元格。
- 可选的 `bots` 列出有资格成为推断候选的机器人，条目形状与 `allowed` 相同。没有它时，不准入任何机器人。
- 可选的 `sync: {label, ready(part), run(host, part, signal)}` 在启动时和点击 **Sync now** 时刷新名单成员。飞书使用群成员。失败会显示在 `sync:<id>` 下，并在一分钟后重试，逐次翻倍到一小时，直到成功。

### 8. 给 Executor 的变量

```ts
  environment: {
    variables: [{ key: 'DSH_SUPERAGENT_WEBHOOK_CONVERSATION', description: {
      zh: '接下工单的 webhook 对话；工单不是从这个来源来的时为空',
      en: 'The webhook conversation that started the ticket; empty when the ticket did not start on this Source' } }],
    values: ({ trigger }) => ({
      DSH_SUPERAGENT_WEBHOOK_CONVERSATION: trigger?.source === 'webhook' ? String(trigger.meta.conversation ?? '') : '' }),
  },
```

即使 Source 被禁用，Execution 设置也会在准备命令旁边显示声明的 `variables`。启用时，`values` 使用部署、配置和起始 Trigger 提供 Ticket 特有的值。

准备命令读取环境变量；worker 在其说明中读取它们的值。使用 `DSH_SUPERAGENT_<KIND>_…` 前缀，对来自其他 Source 的 Ticket 返回空值，永远不要包含凭据。

### 9. 插件入口及其循环

```ts
export const name = 'dsh-superagent-webhook'
export const inject = ['orchestrator']
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.orchestrator.sources.register(webhookKind), 'webhook: source kind')
  ctx.effect(() => {
    const source = sourceContext(ctx.orchestrator, webhookKind)
    const controller = new AbortController()
    // DSH ends its process on an unhandled rejection, so a failure that escapes the loop becomes the Source's health.
    const running = watch(source, controller.signal)
      .catch((error: unknown) => { source.report('webhook', { state: 'error', detail: String(error) }) })
    return async () => { controller.abort(); await running }
  })
}
```

插件注入 `orchestrator`。它的第一个 effect 注册 kind，并在销毁时注销它。第二个 effect 用一个 `SourceContext` 运行轮询循环。销毁会中止循环并等待其完成，包括在应用停止或重启期间。

```ts
async function watch(ctx: SourceContext, signal: AbortSignal): Promise<void> {
  await ctx.ready
  // Setup restarts dsh-superagent once it resolves the accounts; until then the Source reads nothing.
  if (!ctx.configured()) { ctx.report('webhook', health('paused', 'setupPending')); return }
  let failures = 0
  while (!signal.aborted) {
    const config = ctx.config<WebhookConfig>('webhook')
    if (!config) ctx.report('webhook', health('paused', 'sourceOff'))
    else {
      const at = new Date().toISOString()
      try {
        const { read, unreadable } = await pollQueue(ctx, signal)
        failures = 0
        ctx.report('webhook', { state: 'ready', detail: `${read} messages, ${unreadable} unreadable`, at })
      } catch (error) {
        failures += 1
        // One network failure is retried on the next round; three in a row need a person.
        if (!signal.aborted && failures >= 3) {
          ctx.report('webhook', health('error', 'pollFailures', { count: String(failures), error: String(error) }))
        }
      }
    }
    await delay((config?.pollSeconds ?? 30) * 1000, undefined, { signal }).catch(() => {})
  }
}

/** Read the queue after the cursor, take in each message, then move the cursor past them. */
export async function pollQueue(ctx: SourceContext, signal: AbortSignal): Promise<{ read: number; unreadable: number }> {
  const after = ctx.state.get(KV.webhook.cursor) ?? 0
  const output = await ctx.commands.withSignal(signal).run('hookq', ['pull', '--after', String(after), '--json'])
  const page = PageSchema.parse(JSON.parse(output))
  let unreadable = 0
  for (const item of page.items) {
    if (signal.aborted) throw new Error('The webhook Source stopped during the read')
    const message = MessageSchema.safeParse(item)
    if (!message.success) { unreadable++; continue }
    const trigger = webhookTrigger(message.data, page.me)
    if (!trigger) continue
    await ctx.receive(trigger)
    const conversation = { label: { zh: '对话', en: 'Conversation' }, value: message.data.conversation }
    for (const ref of trigger.threads) ctx.threads.describe(threadKey(ref), { facts: { conversation } })
  }
  ctx.state.set(KV.webhook.cursor, page.next)
  return { read: page.items.length, unreadable }
}
```


- **设置检查和开关。** 等待 `ctx.ready`，并在 `ctx.configured()` 为 false 时什么都不读。每一轮都读取 `ctx.config(kind)`：当 Source 关闭时它是 undefined。
- **游标。** 用 `KV`（`src/kv.ts`）中的类型化条目把读取位置存在 `ctx.state` 中，例如 `webhook: {cursor: record<number>('webhook-cursor')}`。`tests/store.spec.ts` 要求 key 字面量只出现在这个注册表中。外部包可以用导出的 `record` 和 `family` 定义 key。设为 `undefined` 会删除一条记录；`ctx.atomic` 把多次写入组合成一个事务。

  只有在游标覆盖的每个 Trigger 都已存储之后，才推进游标。被中断的一轮会让游标保持不变；稳定的 id 让重放是安全的。对于时间戳游标，`src/sources/poll.ts` 中的 `cursorAt(started)` 会减去五秒，以容纳远端的延迟写入。
- **Thread 元数据。** 接收一个 Trigger 之后，调用 `ctx.threads.describe(key, {label, url, facts})` 来填充其显示信息。`ctx.threads.patch(key, meta)` 委托给 `threads.patchMeta`，设置 Source 拥有的 key，或在值为 `undefined` 时删除它们。两者都会忽略不存在的 Thread，包括被过滤的 Trigger 的 Thread。
- **逐项错误。** 对格式错误的 item 计数并继续，而不是让整批失败。`src/infra/commands.ts` 中的 `validItems(item, list, tally)` 支持这种模式。对于独立轮询的 Thread，使用 `src/sources/poll.ts` 中的 `pollThreads`；它把每次失败记录为 `pollError`。它的 `polled` 谓词会保留活跃的订阅，以及在最后一个 Trigger 和 Ticket 结束两者中较晚者之后的两周窗口。
- **健康。** 只通过 `ctx.report` 写入已声明的条目。`health(state, code, values)` 提供固定的消息，例如 `setupPending`、`sourceOff` 和 `pollFailures`。在报告 `error` 之前先统计连续失败的次数。
- **中止。** 把 signal 传给 `ctx.commands.withSignal(signal)` 和 `delay`，并在各 item 之间检查它，这样停止或重启会立即结束循环。

本例不发送由 Source 发起的通知。需要通知的 Source 调用 `ctx.notify`；Outbox 会像其他回复一样送达它们。

本例也不把 Thread 绑定到 Ticket 的完成。只有当某个 Source 的 Thread 生命周期决定工作是否完成时（就像 GitHub pull request 那样），才使用 `ctx.tickets.bindThread` 和 `threadClosed`。何时结束 Ticket 仍由 Engine 决定。

### 10. 注册插件

在 `tsdown.config.ts` 中把模块构建为一个独立的入口：

```ts
entry: { index: 'src/index.ts', 'github-watch': 'src/sources/github.ts', 'feishu-watch': 'src/sources/feishu.ts',
  'webhook-watch': 'src/sources/webhook.ts' },
```

然后在 `package.json` 的 `exports` 中加上 `"./webhook-watch": "./lib/webhook-watch.js"` 来导出构建好的文件，并把插件加到 bundle 的 `cordis.patch.yml` 的 `insert` 列表中，像飞书一样默认禁用：

```yaml
    - id: dsh-superagent-webhook
      name: dsh-superagent/webhook-watch
      disabled: true
```

在某个 profile 的 `cordis.patch.yml` 中用 `id: dsh-superagent-webhook` 和 `disabled: false` 启用该插件。构建并重启。新的 Source 会出现在 Sources 设置和 **Eval → On each Source** 下。

把它的模块和 spec 添加到 [007 架构](007-architecture.md) 的模块表和测试表中。`tests/docs.spec.ts` 会检查两个索引是否完整。

### 11. 测试

参照 `tests/sources.spec.ts` 的模式创建 `tests/webhook.spec.ts`：一个位于临时目录中的真实 Store、一个带 `HealthBoard` 的 `SourceRegistry`、一个带替身端口的 Engine，以及一个来自 `sourceContextOf` 的 `SourceContext`。

通过 spy `Commands.run` 来模拟 CLI 调用。也要 spy `withSignal`，因为它通常会返回一个新的 `Commands` 实例。

```ts
function host(overrides: Partial<SourceContextDeps> = {}) {
  const store = new Store(join(mkdtempSync(join(tmpdir(), 'webhook-')), 'db.sqlite'))
  store.saveSettings(SettingsSchema.parse({
    sources: { webhook: { enabled: true, config: { conversations: [{ id: 'ops', listen: 'mentions' }] } } },
    policy: { sources: { webhook: { allowed: [{ id: 'alice' }] } } },
  }))
  // The registry claims the kind's health entries on the board, where the test reads them.
  const board = new HealthBoard()
  const sources = new SourceRegistry(() => store.settings(), board)
  sources.register(webhookKind)
  const engine = new Engine({ repo: store, scope: sources, policy: () => settingsPolicy(store.settings(), sources),
    assessor: { request: vi.fn() }, executor: { start: vi.fn(), deliver: vi.fn(), stop: vi.fn() },
    outbox: { send: vi.fn(), status: () => undefined, withdraw: vi.fn() } })
  const commands = new Commands(() => testDeployment(), {}, new AbortController().signal)
  const receive = vi.fn((trigger: Trigger) => { const result = engine.receive(trigger); engine.evaluateDue(); return result })
  // The Source's own notices go to the outbox, which keeps their receipts and sends nothing here.
  const deps: SourceContextDeps = { store, engine, outbox: { send: message => { store.receipts.add(message) } }, commands, sources,
    deployment: testDeployment(), ready: Promise.resolve(), configured: () => true, receive, ...overrides }
  return { ...deps, store, engine, commands, receive, health: board.all, ctx: sourceContextOf(deps, webhookKind) }
}
/** The queue as `hookq` answers it. */
function queue(h: ReturnType<typeof host>, answer: () => unknown) {
  vi.spyOn(h.commands, 'withSignal').mockReturnValue(h.commands)
  return vi.spyOn(h.commands, 'run').mockImplementation(async () => JSON.stringify(answer()))
}

it('takes in what the queue holds after the cursor, once, and moves the cursor after it', async () => {
  const h = host()
  queue(h, () => ({ me: 'agent', items: [message('m1'), { id: 'broken' }, message('m2', { conversation: 'elsewhere' })], next: 3 }))
  expect(await pollQueue(h.ctx, new AbortController().signal)).toEqual({ read: 3, unreadable: 1 })
  expect(await h.receive.mock.results[0]!.value).toBe('stored')
  expect(await h.receive.mock.results[1]!.value).toBe('filtered')
  expect(h.store.get(KV.webhook.cursor)).toBe(3)
  // An allowed sender who mentions the agent makes an explicit request.
  expect(h.engine.candidate(key('webhook', 'm1'))?.strength).toBe('explicit')
  await pollQueue(h.ctx, new AbortController().signal)
  expect(await h.receive.mock.results[2]!.value).toBe('duplicate')
  h.store.close()
})
```

`message(id, fields)` 构建一个队列 item。至少覆盖：

- 翻译：稳定的 id、Thread、actor、`human` 和 `addressed`，以及 agent 自己的消息不产生 Trigger；
- 一轮：Trigger 只存储一次，范围之外的一条被 `filtered`，游标在它们之后推进，允许发送者的 @ 被评估为 `explicit`；
- 被中途打断的一轮，保留其游标；
- `send`：`sent`、只在 410 时返回 `gone`，以及对其他任何失败抛出异常，CLI 的错误用 `commandError` 构建；
- Thread 上下文：一页的消息和下一页的游标，就像 `tests/registry.spec.ts` 通过 `SourceRegistry.threadContext` 读取某个 kind 的 Thread 那样；
- 插件：`apply` 注册 kind，并在设置检查等待时报告 `setupPending`，其销毁函数注销 kind，逃出循环的失败会变成 Source 的健康状态，而不是一个未处理的 rejection；
- Source 在 Policy 中的部分及其准入行，就像 `tests/registry.spec.ts` 和 `tests/policy.spec.ts` 检查飞书 Source 的那样。

### 检查清单

1. 映射 Trigger、Thread、actor、Channel 地址和接收范围。
2. 编写 kind：`schema`、`fields`、`health`，以及设置检查推导出 facts 时的 `facts`。
3. 用稳定的 id 把事件翻译成 Trigger，并丢弃 agent 自己的消息。
4. 在 `scope` 中仅凭 `meta` 决定 Source 接收什么。
5. 给它一个 Channel，其 `send` 每条消息只发一次，只在对话永远无法接收时才回答 `gone`。
6. 如果它能读取 Thread，就给研判提供 Thread 上下文。
7. 给它一个带 `allowed` 和准入行的 Policy 部分。
8. 注册其执行环境变量。
9. 编写插件入口和一个循环：等待设置检查、遵循开关、在 `receive` 之后推进游标、逐项保留错误、报告健康状态，并在中止时停止；在 `KV` 中命名游标。
10. 添加构建入口、导出和 `cordis.patch.yml` 的插入项，并在 007 的表格中列出模块及其 spec。
11. 像 `tests/sources.spec.ts` 测试其他 Source 那样测试它。
