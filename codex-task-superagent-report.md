# 长程任务：用一份通俗易懂的 HTML 报告，讲清楚 Super-agent 文章和 dsh-superagent 源码

> 给 Codex 的任务书。请完整读完再开始。这是一个长任务，允许你分多个阶段做完，但最终只交付一个 HTML 文件。

## 0. 一句话目标

在 `D:\ai\super agent\report\` 下产出 **`superagent-explained.html`**：一篇面向“懂一点编程、但没接触过 agent 系统”的读者的中文长文。它要把 DeepSeek 的文章《Super-agent Design Exploration: Towards More Autonomous Agent Systems》讲的设计思想，和 `dsh-superagent-prototype/` 里的真实代码一一对上，让读者看完能回答：

1. 这个东西想解决什么问题？为什么一个普通的聊天 agent 不够？
2. 它的整体架构是什么样的？一条 GitHub 评论从进来到变成一个 PR，中间经过了什么？
3. 它和 DeepSeek Harness（DSH）是什么关系？作为插件是怎么插上去、怎么拔下来的？
4. 提示词是怎么组织的？主 Session（Router）和执行器（Worker）分别被告诉了什么？
5. 文章里说的每个设计，代码里实现了没有，实现在哪个文件？
6. 有哪些风险、限制和还没实现的部分？

**“最通俗易懂”是第一要求。** 每个新概念先用生活中的比喻讲一遍，再给精确定义，最后指向代码。宁可多解释，也不要堆术语。

---

## 1. 输入材料（都在本地）

工作目录：`D:\ai\super agent\`

| 路径 | 是什么 |
|---|---|
| `dsh-superagent-prototype/` | 原型源码（TypeScript，MIT 协议）。**这是第一手事实来源。** |
| `dsh-superagent-prototype/docs/000-008*.md` | 官方设计文档，按编号顺序读，每篇只依赖前面的。`001-domain.md` 定义了全部术语，`007-architecture.md` 是代码索引。 |
| `dsh-superagent-prototype/prompts/` | 内置提示词，一行一句。 |
| `dsh-superagent-prototype/skills/` | GitHub、飞书两个 Source 的技能说明。 |
| `dsh-superagent-prototype/cordis.patch.yml` | 把插件插进 DSH profile 的补丁，还定义了两个 agent preset。 |
| `dsh-superagent-prototype/CLAUDE.md` | 一份很好的代码导读，先读它。 |
| `paper/super-agent-design-notes.md` | 中文学习笔记，含“文章章节 × 源码”对照表。**可以作为起点，但其中每一条都要自己到代码里核实**，有出入以代码为准，并在报告里改正。 |

文章原文：https://www.chaincatcher.com/en/article/2300676 。如果你能联网，就读原文；如果不能，以第 6 节给出的文章摘要和 `paper/` 里的笔记为准。**不要大段翻译或照抄原文**，用自己的话讲，需要引用时只引一两句短句并注明出处。

---

## 2. 工作方式（长任务，请按阶段推进）

### 阶段 A：通读和建立事实底稿（不要急着写 HTML）

1. 按顺序读：`CLAUDE.md` → `README.md` → `docs/000` 到 `docs/008` → `cordis.patch.yml` → `package.json` → `tsdown.config.ts`。
2. 读所有 `prompts/*.md`、`prompts/team/*.md` 和 `skills/*/SKILL.md`，一个都不能漏。
3. 重点读这些源码，弄清楚调用关系：
   - 插件入口：`src/index.ts`、`src/sources/github.ts`（看 `name / inject / apply`）、`src/sources/feishu.ts`、`src/client/index.tsx`
   - 组合根：`src/app/runtime.ts`（`Runtime` 继承 Cordis `Service`，注册成 `orchestrator` 服务）
   - Session 挂接：`src/app/sessions.ts`（preset 选择、`tools.register`、`systemPrompt.section`、`complete: true`）
   - 提示词拼装：`src/app/prompts.ts`
   - 领域核心：`src/core/engine.ts`、`intake.ts`、`evals.ts`、`tickets.ts`、`assignments.ts`、`replies.ts`、`model.ts`
   - 过滤与授权：`src/policy.ts`、`src/app/assessment.ts`、`prompts/admission.md`
   - 执行器：`src/executor/dsh.ts`、`src/executor/background.ts`
   - 工具：`src/app/tools/main.ts`（Router 用）、`src/app/tools/executor.ts`（Worker 用）
   - 副作用队列：`src/app/effects.ts`、`src/app/outbox.ts`
   - 上下文“缓存”：`src/app/resources.ts`、`src/app/cards.ts`
4. 把读到的事实写进底稿 `report/_notes.md`，每条事实都带上 `文件:行号`。这个文件是你自己用的，可以很乱，但**报告里的每一个技术论断都必须能在底稿里找到出处**。
5. 如果需要，可以在 `dsh-superagent-prototype/` 里运行 `pnpm install` 和 `pnpm test`，看测试是怎么描述行为的（`tests/` 里的用例常常是最好的“行为说明书”）。**不要修改原型代码。**

### 阶段 B：写大纲

按第 3 节的章节结构写 `report/_outline.md`：每章写 3 到 5 行，列出要讲的要点、准备用的比喻、要画的图、要引用的代码位置。

### 阶段 C：写 HTML

按第 4 节的技术要求写成单个 HTML 文件。建议一章一章写，每写完一章就自检一遍（第 5 节）。

### 阶段 D：通读校对

把整篇 HTML 从头读一遍，扮演一个“只会写一点 Python、第一次听说 agent”的读者：哪里看不懂，就补比喻或补图。再扮演一个“熟悉这份代码的工程师”：哪里说错了、说得太满了，就改。

---

## 3. 报告章节结构（可以微调，不要删大块）

**开头：一页纸看懂（TL;DR）**
- 用 5 句话讲完整件事。
- 一张总架构图（见第 4 节的图示要求）。
- “阅读路线”：只想了解思想的读第 1 到 3 章，想读代码的读第 4 到 9 章。

**第 1 章　问题：为什么一个聊天 agent 不够用**
- 比喻：一个能干的员工，但每次只能接一个电话，接电话时手上的活就得停。
- 文章观点：瓶颈从“模型能力”转向“人的注意力”，一个人最多同时跟进 3 到 5 个 Session。
- Super-agent 的四个特征：Continuous、Efficient、Proactive、Persistent。每个都配一个生活例子。
- 为什么单个 ReAct 循环做不到（同步阻塞、上下文混在一起、设备离线就停）。

**第 2 章　核心思想：把计算机系统的老办法搬过来**
- 用表格列出：分层、Fast/Slow Path、缓存、投机执行、存算分离、看门狗。每一行都写“在操作系统或数据库里是什么”和“在这里变成了什么”。

**第 3 章　文章的五个模块（概念篇）**
- 3.1 双层架构：Router 和 Worker。比喻：餐厅的前台（领位员）和后厨。前台不炒菜。
- 3.2 事件驱动：Trigger、Thread、订阅、两级过滤。比喻：快递分拣，先机器按邮编分（Fast Path），再人工看地址（Slow Path）；同一个包裹的后续追件直接送到负责的人手上。
- 3.3 上下文当缓存：Inline、Spill、Chain of Recall。比喻：桌面放常用资料，档案柜放其他的，桌上的便签写着“详见档案柜第 X 格”。
- 3.4 投机执行：先悄悄复现和修复，有把握才开口。
- 3.5 以人为中心的交互：全双工（`start()`/`stop()`），IM 每条不超过 100 字，PR 要写得结构化。
- 3.6 计算、状态、环境分离与 BYOM。
- 3.7 Watchdog。
- 3.8 实验结果：用一张简单的柱状图或表格对比 p50/p95，并讲清楚结论：**靠 prompt 劝模型委派不可靠，要靠架构强制**。也要讲清楚代价是 token 更多。

**第 4 章　它和 DeepSeek Harness 的关系**
- 比喻：DSH 是手机操作系统，dsh-superagent 是装在上面的一个 App。App 不自己造摄像头和网络，而是调用系统提供的能力。
- DSH 提供了什么（Session、工具、system prompt、技能、Web 服务器、LLM 调用），superagent 自己做了什么（多 Session 的组织、领域状态、调度、面板）。
- 为什么 `@deepseek-ai/*` 都是 `peerDependencies`；`engines.dsh` 的作用。
- 一句话总结：**DSH 负责“一个 agent 怎么跑”，superagent 负责“多个 agent 怎么组织、什么时候干活”。**

**第 5 章　插件是怎么插上去、拔下来的**
- bundle 的组成：3 个主机插件（主插件、github-watch、feishu-watch）、1 个浏览器面板（`client.js`）、2 个 agent preset。画一张图。
- `cordis.patch.yml` 的作用：`insert` 了什么，为什么飞书默认 `disabled: true`，用户 profile 里的机器配置（`stateDir`、端口）放在哪里。
- Cordis 的 `name / inject / apply` 约定，`ctx.effect(() => 清理函数)` 为什么是插拔的核心。用伪代码讲“插上时发生什么、拔下时发生什么”。
- `Runtime` 注册成 `orchestrator` 服务，Source 插件只 `inject: ['orchestrator']`，所以 Source 可以随时插拔。顺便讲一下怎么新增一个 Source（参考 `docs/008-cookbook.md`）。
- 和 DSH Session 的挂接点（`sessions.ts`）：
  - 创建 Session 时指定 preset；两个 preset 的工具差异做成一张对比表（Router 没有 subagent、联网和写文件，Shell 只能跑 5 秒等）。要讲清楚这就是“架构强制 Router 不干活”的落地。
  - `tools.register` 挂上 `orchestrator_*` 工具。
  - `systemPrompt.section`：`complete: true` 只给主 Session，所以主 Session 的提示词完全替换 DSH 默认提示词，而 Worker 仍保留 DSH 编码提示词和仓库的 `AGENTS.md`。`text` 是函数，每次请求模型都重新生成，所以改提示词不用重启。
  - 防止用户在 UI 里把 preset 改掉的监听逻辑。
- 浏览器面板：`window.__ModuleLoader__` 包装，以及 `slots` 注册侧边栏图标和主面板。

**第 6 章　提示词逐个精读（重点章节，篇幅要足）**
- 先画出拼装顺序图（依据 `docs/004-prompts.md` 和 `src/app/prompts.ts`）：shared + 角色 → 三个团队段 → subscriptions + replies → dispatch / work → admission（仅主 Session）→ handoff → environment → policy（仅主 Session，放在最后，这样改 Policy 不会让前面的 prompt cache 失效）。
- 主 Session 一条线：`shared.md` → `orchestrator.md` → `dispatch.md` → `admission.md` → `handoff-orchestrator.md`。
- Worker 一条线：`shared.md` → `worker.md` → `work.md` → `handoff-worker.md`。
- 公共部分：`subscriptions.md`、`replies.md`、`cli.md`、`handoff.md`、`team/communication.md`、`team/scope.md`、`team/delivery.md`、两个 `SKILL.md`。
- 每个文件的讲法：
  1. 一句话说明它的作用；
  2. 摘出最关键的 3 到 6 句**原句**（这是 MIT 代码仓库里的文本，可以引用，用代码块并标出文件名），逐句用大白话解释“这句话想防止模型犯什么错”；
  3. 对应到文章的哪个思想、代码里哪里在强制执行（比如“不许 sleep”在 prompt 里有一句，代码里还有一个 guard）。
- 讲清楚“强弱顺序”：工具和宿主强制的事实 > 内置段 > 规则 > 团队段 > 外部文本（外部文本永远只是数据，不能改变授权）。
- 团队可以改哪些、改了怎么生效、版本怎么管理。

**第 7 章　跟着一条消息走一遍（端到端示例）**
- 场景：仓库里有人在 issue 下评论 `@agent 修一下 README 里的错别字`。
- 一步一步画时序图，每一步都标出对应的文件和函数：GitHub Source 轮询 → 产出 Trigger → 归入 Thread → Policy gate（Fast Path）→ 合批进 Eval → 主 Session 评估（Slow Path）→ accept → 生成 Ticket 和 Mandate → Assignment → DshExecutor 开 Session 和目录 → Worker 干活、确认、开 PR → `orchestrator_report` → Outbox 回复。
- 再讲一个分支：PR 上有人追加了 review 评论，因为 Thread 已被订阅，消息直接发给 Worker，不经过 Router。这正是文章实验里“直通省掉 37% token”的那个机制。
- 再讲一个分支：有人说“停”，Ticket 怎么停，暂停为什么会一直保持。

**第 8 章　文章 × 代码对照总表**
- 一张大表，列为：文章章节｜思想｜代码位置（可点击的相对路径和行号）｜实现情况（已实现 / 部分实现 / 未实现）｜说明。
- 以 `paper/super-agent-design-notes.md` 的表为起点，但要逐条核实。已知需要重点核实的：Router 批处理是不是真在 `evals.ts`；`start()`/`stop()` 全双工在原型里对应什么；Watchdog 是否真的没有（`HealthBoard` 和 `docs/006` 里的 Hourly check 算不算一种“简化版看门狗”，请给出你的判断和理由）；计算与执行环境分离是否完全没有。

**第 9 章　工程上值得学的地方**
- 领域核心是纯函数式的，`Engine` 是唯一的写入者。
- 持久化的副作用队列：命令里不做 I/O，提交事务后再执行，带重试。
- 窄接口（`Pick<>` 风格），按角色给出不同的 `EngineFor*` 类型。
- “文档就是规格，测试来守”：`docs.spec.ts`、`model-surface.spec.ts` 等 meta 测试。
- 每条都用一小段真实代码说明。

**第 10 章　风险、限制和开放问题**
- 安全：两个 preset 都以 `danger-full-access` 运行，跑在操作员的系统账号下；账号包装脚本只是选凭据，不提供隔离；prompt injection；凭据可能进入模型上下文。
- 原型和文章的差距：单机，不是云端；没有边缘 daemon；等等。
- 文章第 8 节的开放问题，用大白话复述。

**附录**
- 术语表：Source、Trigger、Thread、Correlation、Channel、Policy、Eval、Mandate、Ticket、Assignment、Subscription、Router / 主 Session、Worker / Executor、preset、bundle、Cordis。每个词给出“一句话比喻 + 精确定义 + 在哪个文件”。**术语必须和 `docs/001-domain.md` 一致。**
- 目录结构速查（`src/core`、`src/app`、`src/sources`、`src/executor`、`src/client` 各管什么，以及它们之间的 import 规则）。
- 如何自己跑起来（概括 `SETUP.md` 和 `docs/006`，不需要逐条复制）。

---

## 4. HTML 技术要求

- **单个文件**，可以双击直接在浏览器打开，离线可用。CSS 和 JS 全部内联。不要依赖构建工具。
  - 如果确实需要图表库，只能从 `cdnjs.cloudflare.com` 或 `cdn.jsdelivr.net/npm/` 加载，并写死具体版本号；更推荐**手写内联 SVG**，这样离线也能看。
- **图要多。** 至少包含：总架构图、Router / Worker 双层图、事件过滤与路由流程图、插件结构图、提示词拼装顺序图、端到端时序图、实验结果对比图。全部用内联 SVG，文字可选中，颜色使用 CSS 变量，深色模式下也要清楚。
- **排版：**
  - 左侧（宽屏）或顶部（窄屏）固定目录，点击可跳转，滚动时高亮当前章节。
  - 正文最大宽度约 760px，行高 1.7 以上，中文字体使用系统字体栈。
  - 支持浅色和深色：颜色在 `:root` 上定义成变量，并在 `@media (prefers-color-scheme: dark)` 里重新定义；`body` 要设置明确的背景色。可以加一个手动切换按钮。
  - 手机宽度下不出现横向滚动；代码块可以自己横向滚动。
- **四种提示框，样式统一：**
  - 💡“打个比方”：比喻；
  - 📌“精确地说”：定义；
  - 🔍“代码在这里”：文件路径加行号，再加一小段代码；
  - ⚠️“注意”：坑、限制和风险。
- **代码块**有语法高亮（可以手写简单的高亮，或用一个固定版本的 CDN 库），右上角标出文件名。
- **可折叠细节**：深入的技术细节用 `<details>` 收起，默认只显示通俗版本。这样小白读者不会被淹没，工程师也能展开看。
- 每章末尾放一个“本章小结”，3 句话以内。
- `<title>` 用简短的名字，比如“Super-agent 拆解”。

---

## 5. 准确性规则（非常重要）

1. **代码是唯一的真相来源。** 文章、笔记和本任务书里的说法如果和代码对不上，以代码为准，并在报告里写明“文章说 X，原型里实际是 Y”。
2. **每个技术论断都要有出处**：在“代码在这里”框或对照表里给出 `dsh-superagent-prototype/src/...:行号`。行号要是真实的，写之前再打开文件确认一次。
3. **区分三种东西**，并在文中明确标出：文章提出的设计；原型实现了的；原型没实现的或只是“未来方向”。README 明确说过，原型不等于内部版本，有些设计没实现。
4. **不要编造**数字、函数名、文件名或行为。不确定的地方写“未能从代码确认”，不要猜。
5. 文章里的实验数字只能引用文章给出的（见第 6 节），不要自己推算新的数字。
6. 本任务书里给出的代码细节（行号、片段）是任务布置者读代码时记下的，**仍然需要你自己复核**。

---

## 6. 文章摘要（离线时用；能联网就以原文为准）

- 发布于 2026-10-31，作者是 DeepSeek 产品团队，执笔人为 Yujia Qiao。配套原型叫 `dsh-superagent-prototype`，文中声明它只是原型，不是 DeepSeek 的正式产品。
- 主张：agent 要从“单任务单会话的工具”变成持续在线、主动工作的 Super-agent，具备 Continuous、Efficient、Proactive、Persistent 四个特征。单个 ReAct 循环做不到，需要专门的架构。
- **双层架构**：Router 常驻，负责和人交互、派活、管理全局记忆，不执行任务，可以不给 Bash，用轻量模型即可。一次推理期间收到的 Trigger 合并到下一次调用里一起处理，负载越高越划算。Worker 一个任务一个，上下文隔离，有全套工具，用最强的模型，只向 Router 汇报，内部可以开 Subagent。
- **事件驱动**：程序规则做 Fast Path，LLM 语义判断做 Slow Path。同一个 PR、IM 话题或邮件线程是一个 Thread；Worker 订阅 Thread 后，后续事件直接交给它，订阅可以多对多。上下文窗口当缓存：Inline / Spill，按需逐跳召回（Chain of Recall），对象之间用 ID 互相引用。投机执行：先静默复现和修复，有简单修法才开口。
- **交互**：用异步的 `start()`/`stop()` 实现全双工（DSH 已实现，但默认未开启）。IM 每条回复不超过 100 字；GitHub、邮件等异步渠道写结构化、信息密集的内容。
- **分离**：Agent Loop 在无状态云容器里跑，状态存数据库。用户机器上只跑一个轻量 daemon，只执行命令，不存状态，支持 BYOM，设备重新上线后任务自动继续。
- **Watchdog**：由定时消息驱动的独立 Session，检查基础设施故障，也检查 Worker 有没有实质进展、是否偏离目标；可以用自然语言询问它，让它在线修改 prompt 或规则。
- **实验**（合成负载，约 300 条消息，其中约 20 条是工作请求，真正的工作换成只耗时间的假工具，每种方案跑 5 次）：
  - Super-agent：p50 12.4 分钟，p95 15.7 分钟。
  - 单会话 + Subagent，中性 prompt：5 次里一次都没委派，p95 29.5 分钟。
  - 单会话 + Subagent，“优先委派” prompt：5 次里委派了 4 次，剩下一次模型自己干了，造成长尾。
  - 去掉直通：完成时间差不多，Router 决策多了约 30%，cache-read token 从 2323 万涨到 3177 万（约 +37%）。
  - Router 批处理实验：事件到达率从每分钟约 1 条提到约 40 条；具体数值只在图里，正文没写，报告里不要编。
- **开放问题**：Router 怎么分片；Worker 之间要不要直接通信；长期记忆；离开“会话”形态后的产品形态，人怎么中途介入；上下文边界与 A2A；安全隐私（不可信输入、云端被攻破会波及所有设备、要做到“能用凭证但看不到凭证”）。
- 作者自己说并没有提出全新理论，只是把经典的系统设计思想用在了 agent 上。

---

## 7. 交付与验收清单

交付物：
- `D:\ai\super agent\report\superagent-explained.html`（主交付）
- `D:\ai\super agent\report\_notes.md`（事实底稿，带行号）
- `D:\ai\super agent\report\_outline.md`（大纲）

完成前逐条自检：
- [ ] 第 3 节列出的 10 章和附录都在，第 6 章（提示词）篇幅最长、覆盖了 `prompts/` 和 `skills/` 下的每一个文件。
- [ ] 至少 7 张内联 SVG 图，深色和浅色模式下都清楚。
- [ ] 每个新术语第一次出现时都有比喻和定义，并且和 `docs/001-domain.md` 的用词一致。
- [ ] 所有 `文件:行号` 都打开核对过。
- [ ] 对照总表里每一行都有“实现情况”，并且“部分实现 / 未实现”的都写了理由。
- [ ] 没有大段照搬文章原文。
- [ ] 断网状态下双击打开，页面完整显示，没有控制台报错；手机宽度（375px）下没有横向滚动。
- [ ] 没有修改 `dsh-superagent-prototype/` 里的任何文件。

最后，在对话里用 5 句话以内汇报：做了什么、文件在哪、有哪些地方你没能从代码确认、和笔记相比你改正了哪些说法。
