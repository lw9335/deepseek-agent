# 领域核心核查底稿

以下路径均相对 dsh-superagent-prototype/；每项已打开正文核查。

- 术语遵循 docs/001-domain.md:27-37；Source 是事件流，Trigger 是不可变事件，Thread 是时间序列，Correlation 只加上下文不路由，Channel 是写侧，Eval 是 gate+assessment 的评估，Mandate 是不可变授权，Ticket 是获授权的工作，Assignment 是 Ticket 与某个执行器实例的绑定，Subscription 是 Thread 持有的多对多关系。
- Engine 是领域写入的单入口，receive/decide/report 包装同步 repository atomic；src/core/engine.ts:19-22,48,100,239。不能称整个核心“纯函数”：它是类、会改实体并经端口排队；可说领域决策与外部 I/O 分离。
- 窄接口真实代码 src/core/engine.ts:261 `export type EngineForSources = Pick<Engine, 'receive' | 'bindThread' | 'threadClosed'>`；其他角色见263-270。
- Intake.receive 去重、Source scope 过滤、建立 Thread correlation，然后先 fan-out 后检查 owners 决定排 Eval；src/core/intake.ts:19-60。人类后续消息已有非context worker负责时不再 Eval；bot/CI 仍可 Eval，不能写“所有订阅消息均绕过 Router”。
- 人工停止的 Ticket 不收任何后续消息：src/core/intake.ts:40-44；Tickets.wake 遇 ended.by human 立即退出：src/core/tickets.ts:252-259。
- 批处理确实在 Evals，按 Thread：Engine.evaluateDue 仅在 pending.length && !evaluating 时 start，src/core/engine.ts:75-84；Evals.start 将整个 thread.pending 放入 evaluating.triggerIds 再清空，src/core/evals.ts:91-118。不是跨所有 Thread 的一个巨大 Eval；Sessions relay ordered 是投递顺序 src/app/sessions.ts:99-105，不等同于源码内证明 Harness 的 prefill 批处理算法。
- gate 位于 Evals.start 内，对 batch 每个 trigger 判断并选 strongest；src/core/evals.ts:95-110；白名单且 addressed 直接 explicit：src/policy.ts:191-210。机器事件 gate src/policy.ts:170-187；inferred 需 auto、启用规则和明确实施方向等 src/policy.ts:40-60,212。
- 显式请求与推断候选走不同工具：显式 orchestrator_route accept 在 src/app/tools/main.ts:88-117；推断调用 MasterAssessor.context/read/decide 在 src/app/assessment.ts:109-115,183-219,272-278；MasterAssessor.evalFor 会拒绝 explicit，不能把 @agent 修错字写成必须调用 orchestrator_eval 的 Slow Path。
- MasterAssessor.request 先排 assessment effect，处理器投递候选后 candidateDelivered 才开始超时，src/app/assessment.ts:94-104；上下文有窗口、摘要、分页，src/app/assessment.ts:175-219,240-269。
- Evals.accept 创建 mandate 再 tickets.create，src/core/evals.ts:305-315；tickets.create 生成 Assignment、订阅 Threads、排 executor.start，src/core/tickets.ts:37-55。
- DshExecutor.start 是排 launch effect，非立即执行 I/O：src/executor/dsh.ts:264-268；launch 检查 paused、当前 Assignment/活 Ticket，准备目录、ensure worker session、投递 assignment，src/executor/dsh.ts:424-469；prepare timeout 与空目录失败处理见247-258；无 prepare 命令则空工作目录，不能声称自动 clone。
- GitHub comments 规范化为 Trigger：src/sources/github-trigger.ts:65-80；notification/current thread 读取并 receive：src/sources/github.ts:297-341,388-400；PR 的绑定由报告 claim 或轮询 observePull 实现，src/sources/github-pull.ts:51-74。
- Worker 可报 PR、report、relay 主 Session，原子性由工具实现：src/app/tools/executor.ts:75-98。开 PR 是 Worker 工具执行与提示词要求，不是宿主固定保证每 Ticket 都有 PR。
- Replies 决定 Channel 并 outbox.send，src/core/replies.ts:65-86；Outbox 原子保存 receipt 和 reply effect、飞书长度校验 src/app/outbox.ts:23-31；deliver 处理暂停、Source off、按 Ticket+conversation 顺序、gone 等 src/app/outbox.ts:39-50。故 report 不等于已发外部消息。
- stop 普通文字要由 Router 经 route 判断，Evals 仅 explicit stop，src/core/evals.ts:293-301；面板直接 stopTicket src/core/engine.ts:157-160。Tickets.stop 记 human/stopped，src/core/tickets.ts:157-162；end 停 Assignment，src/core/tickets.ts:345-362；DshExecutor.stop 提交后 cancel 和停后台，src/executor/dsh.ts:353-365。
- 全局 processing pause 是另一个持久设置，不是 Ticket stop：src/policy.ts:99-108；Engine.evaluateDue 在 paused 返回 src/core/engine.ts:75-84；Evals.due 延后deadline避免暂停期间超时，src/core/evals.ts:35-45；Outbox handler limit pause=0 src/app/outbox.ts:24；已有执行回合不被该设置中断（docs/003-execution.md Pause processing 段）。
- Effects SQLite持久队列：src/app/effects.ts:43-44,60-65；默认退避2秒到60秒 src/app/effects.ts:70；失败退避计算src/app/effects.ts:136-145。Outbox回复独立5秒到300秒 src/app/outbox.ts:24。不能宣传外部副作用 exactly-once，receipt幂等只能覆盖本地队列/消息ID。
- Store.atomic 使用SAVEPOINT，异常回滚、嵌套后提交回调，src/app/store.ts:134-161；afterCommit仅内存跟进，重启须保存的工作用Effects，src/app/store.ts:155-157。
- HealthBoard 只是组件健康 registry，无模型、无周期任务、无目标进度判定：src/infra/health.ts:11-34；Runtime 每 pass 更新 evalsHealth src/app/runtime.ts:154-158；Passes两秒循环 src/app/passes.ts:28。不能等同文章独立 Watchdog Session。
- docs/006-deployment.md:133-141 明确要求用户在“平常用的另一个 DSH profile”创建 hourly schedule。此为部署指导，仓库不自动创建；可监测进程状态、错误、配置并尊重 manually_stopped，属于基础设施恢复指导，未实现文章目标偏离/实质进展审查的完整看门狗。
- 计算/状态有本地分离：Store SQLite src/app/store.ts:49-55；执行器端口 src/core/ports.ts，落地 DshExecutor 本地目录 src/executor/dsh.ts:424-441；ExecutionEnvironment 是变量注册/配置接口 src/app/execution-environment.ts。不能说“完全未涉及执行环境抽象”，也不能说已有云Loop+边缘daemon/BYOM。
- 主 Session 无等待 guard：src/app/sessions.ts:69-85,264；bash sleep与超30秒参数拒绝、job_output wait至多5秒；preset shell上限5秒。与文章start()/stop()异步工具协议不是同一个API，src/executor/dsh.ts:start/stop 是 Assignment 生命周期端口。
- 文档meta测试检验顺序/链接/模块和测试目录覆盖，tests/docs.spec.ts:35-68；model-surface 测试模型可见工具、prompt和资源预算/术语，tests/model-surface.spec.ts:1-4,35-59。测试存在不能自动宣称已运行通过。

## 与 paper 笔记修正

- Router批处理已实现，但限定是每Thread积压批次；不把relay有序投递直接等同Harness批处理性能保证。
- 全双工不是“原型没开启”：原型实际启用后台任务和消息投递、等待限制；不能由此断言实现了文章一模一样的start/stop工具接口。
- Watchdog不是“只有HealthBoard”这么简单：还有docs006外部小时巡检安排；完整独立语义Watchdog仍未能确认实现。
- 计算执行环境分离不是“完全未涉及”：有端口和执行环境变量抽象，但没有文章云/边缘部署。
- IM上限以源码IM_WORDS为准，不应擅改为100个汉字；原始笔记“词”比任务书中的“字”准确。

