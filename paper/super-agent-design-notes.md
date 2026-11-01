# 《Super-agent Design Exploration: Towards More Autonomous Agent Systems》学习笔记

- 作者:DeepSeek 产品团队(DeepSeek Harness 团队,主笔 Yujia Qiao),2026-10-31
- 原文(英文转载全文):https://www.chaincatcher.com/en/article/2300676
- 配套原型:`dsh-superagent-prototype/`(本目录)

> 下面是用自己的话写的要点和与源码的对照,不是原文翻译。细节以原文为准。

## 0. 文章要解决的问题

- 现在的 agent 以"单个 Session"为单位:单任务的上限取决于模型能力,多任务的上限取决于人的注意力。作者观察到,一个人同时最多能跟进 3 到 5 个活跃 Session。
- 给单 Session agent 接上 CLI、MCP 或外部连接器还不够:它仍然会同步阻塞,多任务的上下文会混在一起,本地设备一离线就停摆。
- 目标形态是 **Super-agent**,具备四个特征:
  - **Continuous**:用户觉得始终只有一个 agent,可以跨渠道接着聊。
  - **Efficient**:多任务并行,不用等上一条做完。
  - **Proactive**:主动观察事件,没必要时保持安静。
  - **Persistent**:常驻在线,出了异常能自愈。
- 全文的基调是:**把计算机系统里的经典思想搬到 agent 系统上**,比如 Fast/Slow Path、缓存、投机执行、存算分离和外部控制环。

## 五个模块 × 原型源码对照

| 文章章节 | 核心思想 | 原型里的对应 | 实现情况 |
| --- | --- | --- | --- |
| §2 双层架构 | 常驻的 **Router** 负责与人交互和派活,不干具体活;隔离的 **Worker** 并发执行,只向 Router 汇报 | 主 Session(`dsh-superagent-router` preset,`src/app/tools/main.ts`)/ Executor Session(`src/executor/dsh.ts`、`src/app/tools/executor.ts`) | 已实现 |
| §2.1 Router 批处理 | Router 推理期间积压的 Trigger 在下一轮合并注入,利用 Prefill 并行,事件越多,单次决策越便宜 | `Evals` 按 Thread 把排队的 Trigger 合成一批(`src/core/evals.ts`);relay 在下一步一起送达 | 已实现 |
| §3.1 事件过滤 | 程序层 Fast Path(来源、群范围、白名单)+ 语义层 Slow Path(LLM 加 prompt 策略) | `Policy.gate`(`src/policy.ts`)+ MasterAssessor 和 `prompts/admission.md` | 已实现 |
| §3.2 事件路由 | Thread 订阅:新任务走 Router(慢路径),同一 Thread 的后续事件直接发给已订阅的 Worker(快路径);订阅是多对多 | Subscription 和 fan-out(`src/core/intake.ts`、`tickets.ts`),`orchestrator_thread_follow/unrelated` | 已实现 |
| §3.3 上下文组织 | 把上下文窗口当 Cache:**Inline**(预先放进可能用到的信息)和 **Spill**(截断并留读取入口);对象之间用 ID 互相引用,形成 **Chain of Recall** 逐跳召回 | `orchestrator_read` 资源图(`src/app/resources.ts`)、卡片(`cards.ts`)、各种字数上限和 `next_offset` | 已实现 |
| §3.4 主动行动 | 投机执行:先在后台试着复现和修复,有价值才交付,否则保持沉默 | 推断候选("inferred")+ auto 模式下的 admission 规则 | 部分实现(靠策略配置) |
| §4.1 全双工交互 | 异步 ReAct Loop:`start()` 立即返回,结果作为新事件回来,可以 `stop()` | Harness 的后台 job(`job_output`、`job_kill`)、`noWait` 守卫 | Harness 已有,文中说**默认未开启** |
| §4.2 多渠道交互 | IM 要轻量,单条回复 ≤100 词;GitHub、邮件要结构化、信息密度高 | 确认回复限 100 词;Outbox 对飞书有字数上限;`prompts/replies.md` | 已实现 |
| §5.1 计算与状态分离 | Agent Loop 无状态、跑在云端容器,Session 状态存数据库 | 原型是单机:SQLite Store + Effects 持久化,支持重启恢复 | 部分实现(持久化有,但不在云端) |
| §5.2 计算与执行环境分离 | 云端 Loop + 本地轻量 daemon(BYOM),环境留在原地 | 原型未涉及 | 未实现 |
| §6 Watchdog | 主系统之外的独立 Session,由定时消息驱动,检查基础设施和"任务有没有真进展" | 原型里没有 watchdog(只有 HealthBoard 健康项) | 未实现 |

## §7 实验要点

- 实验设置:约 300 条消息,其中约 20 条是真正的工作请求,其余是闲聊、追问、取消和 CI 消息。写代码的环节换成只耗时间的假工具,所以测的是**调度能力**,不是写代码的能力。
- **Super-agent** 的 p50/p95 完成时间是 12.4 / 15.7 分钟。对照组是单 Session + Subagent:用中性 prompt 时,模型一次都没委派,p95 达到 29.5 分钟;用"优先委派"的 prompt 后变快了,但仍然更慢、更不稳定。
- 结论:**靠 prompt 劝模型去委派不可靠,要在架构层面强制 Router 不干活**。
- 代价:多个 Session 意味着 cache-read token 更多。
- **去掉"订阅直通"之后**:完成时间基本不变,但 Router 的决策次数多了约 30%,cache-read token 从 2323 万涨到 3177 万(+37%)。可见直通机制主要省的是 Router 的开销。

## §8 开放问题

1. Router 撑不住时怎么横向拆分,Worker 之间什么时候需要直接通信;更长期的问题是长期记忆。
2. 离开"Session"这种形态之后,产品上怎么呈现任务;人在执行中途怎么介入或接管。
3. 上下文边界怎么划:哪些范围共享一个实例,哪些要隔离;实例之间的 A2A 协作。
4. 安全与隐私:事件驱动带来不可信输入(prompt injection);云端到边缘设备的信任关系;怎么做到让 agent "能用凭证但看不到凭证"。
