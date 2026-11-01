# 阶段 A：总论与概念证据

本轮文章链接通过 web 打开失败；文章观点、实验数据暂依据任务书第6节及 paper/super-agent-design-notes.md，均标明为文章报告，不作为原型实测。原型事实以实际源文件为准。仓库基线见 _baseline.json；git 原有未跟踪 CLAUDE.md。

- 原型非正式产品、不同于内部实现，有设计未实现：dsh-superagent-prototype/README.md:3、5。
- agent以少占用人的注意力为目标：dsh-superagent-prototype/docs/000-philosophy.md:5；这是设计理念。
- 领域术语、订阅多对多、Correlation仅提供上下文：dsh-superagent-prototype/docs/001-domain.md:24；代码需结合核心审计核对。
- Thread批处理：dsh-superagent-prototype/src/core/evals.ts:71，start读取pending，逐个调用gate（96），将pending放入evaluation（110），清空pending（112），请求assessor（118）。这是每Thread合批，不等于整个系统所有事件一个Eval。
- 已有worker拥有的人类follow-up不做一般评估：dsh-superagent-prototype/src/core/evals.ts:74、147；非stop决定被拒绝。
- 主Session收到持久化relay：dsh-superagent-prototype/src/app/sessions.ts:104；steer通过AgentDelivery交给宿主inbox，不应说evals.ts独自实现所有模型请求合批。
- 上下文预览：dsh-superagent-prototype/src/app/cards.ts:8、11，preview压缩空白截160字符，卡片含read入口。
- 逐跳资源：dsh-superagent-prototype/src/app/resources.ts:24，资源列ticket、thread、trigger等；89分页列表，91返回next_offset。
- 文本分页：dsh-superagent-prototype/src/app/cards.ts:89，UTF-16单位切片，next_offset为空表示结束；不等于token计数。
- 评估上下文窗口与按需读取：dsh-superagent-prototype/src/app/assessment.ts:175、183、225；explicit请求在113行被evalFor拒绝，应走直接route。
- noWait仅对bash的sleep/timeout和job_output等待检查：dsh-superagent-prototype/src/app/sessions.ts:67、74；不是完整shell安全隔离，不能笼统说一切等待均阻止。
- 两类会话通过ensure设置danger-full-access：dsh-superagent-prototype/src/app/sessions.ts:140、154。
- IM以100个word-like片段计数而非100汉字：dsh-superagent-prototype/src/infra/text.ts:2-15，Intl.Segmenter('zh')，链接标签与URL均计入。
- HealthBoard是健康项注册表，没有自主推理循环：dsh-superagent-prototype/src/infra/health.ts:15-33。
- 部署文档要求另一个profile建立每小时检查：dsh-superagent-prototype/docs/006-deployment.md:133-143，respect-stop保留人为停止；它是可配置运维看门狗，不是开箱即用的Worker语义进展审查。

文章摘要记录：Continuous / Efficient / Proactive / Persistent；单人3–5个活跃Session是作者观察，不是认知科学定律；约300条合成消息、约20条工作请求、每方案5次；Super-agent p50/p95=12.4/15.7分钟，中性单Session p95=29.5分钟；去直通cache-read从2323万到3177万、约+37%，Router决策约+30%。不能把“去掉后增加37%”改写为“使用后节约37%”；批处理图数值不猜测。

## 第1—3章复核补充

- 修正宽泛出处：版本实际在 package.json:5，宿主peer依赖在62，README的原型/内部版本差异在5，功能概览在7。
- 默认 observe 模式与 would_accept 行为：src/policy.ts:40-60、83-87；不要用 docs/002:112（该处实际是Policy变化列表）证明默认模式。
- 持久化为 SQLite：src/app/store.ts:47-60；重启恢复：src/core/assignments.ts:83-91；不要用 docs/003:177（渠道失败段）证明恢复。
- Worker容量：src/executor/dsh.ts:166-197；本机工作目录和 Session：src/executor/dsh.ts:424-441；Worker报告工具：src/app/tools/executor.ts:75-98。
- Router preset 不含 subagent/web/写文件等的注释从 cordis.patch.yml:121 开始；shell timeout在145-156，write/edit false在163-167。5秒是等待上限，不是进程存活上限。
- 订阅的准确边界：src/core/intake.ts:38-59；人类后续如果仍有Worker ownership则不进新Eval，bot/CI事件仍可评估；纯context Thread不授予后续工作ownership，docs/001-domain.md:37。
- 显式准入：src/policy.ts:191-210；explicit走route：src/app/tools/main.ts:88-117；MasterAssessor.evalFor拒绝explicit：src/app/assessment.ts:109-115。
- 卡片真实 preview/chars/read 字段：src/app/cards.ts:9-14；ticket关联资源：60-68；UTF-16分页：88-92；资源目录：src/app/resources.ts:24-54。
- 执行器是排队端口：src/core/ports.ts:55-68；本机落地：src/executor/dsh.ts:424-469；执行变量注册/拼装：src/app/execution-environment.ts:27-35。这些接口不证明远端daemon协议。
- SVG文本必须HTML转义，ticket/<id>等资源名否则会变成SVG子元素；_main-build.mjs现统一转义图内文字。
