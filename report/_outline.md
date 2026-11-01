# 报告大纲（合并）

# 阶段 B：前四节大纲

## 开头：一页纸看懂
- 5句话讲从团队消息到授权工作，再到结果；先介绍餐厅前台后厨和工作台账比喻。
- 总架构SVG，文章/实现/缺口标签，阅读路线。
- 引用README:3-7、core/evals.ts:71、cards.ts:8，详细证据由后章展开。

## 第1章：为什么聊天agent不够
- 一人接电话同时修东西的瓶颈；解释模型、工具、Session、ReAct。
- 四个目标逐个生活例子；声明文章观察和假设范围。
- 用原型会话和后台工具对照，不把云端持久在线当本地事实。

## 第2章：经典系统思想
- 分层、快慢路径、缓存、投机、存算分离、看门狗对照表。
- 每项讲原本含义、agent映射、实现边界。
- 引用evals、cards/resources、HealthBoard和006每小时检查。

## 第3章：文章的模块与实验
- 双层图、路由图、上下文图、实验图；逐个定义事件术语。
- 解释显式请求与推断候选差别；直通不给授权，批处理有两个层级。
- 解释投机规则、异步交互、100词限制、BYOM与Watchdog边界。
- 实验只用任务书给定数值，标清合成负载，不将token相对增长倒置为节省。


# 插件、风险和附录大纲

## 第4章 DSH关系
- 手机操作系统与App类比，定义DSH宿主/bundle，解释一个agent运行与多agent组织。
- 从index.inject说明宿主能力，从Runtime/Engine说明原型职责；peerDeps共享宿主与engines版本声明。
- 引package.json:30,53,62；index.ts:8；runtime.ts:88；不替宿主源码证明内部。

## 第5章 插拔
- App安装包类比；SVG画三主机插件、一面板、两preset。
- patch insert/profile机器配置；name/inject/apply；effect注册和清理伪代码+真实片段。
- Router/Worker能力表，5秒阈值解释、shell非安全边界；session preset/tools/prompt装饰与恢复监听。
- 浏览器ModuleLoader与slots；新Source配方；runtime shutdown与Session preset不能随意删。

## 第10章 风险
- 钥匙串与专用工牌类比，授权和OS权限分开；danger full、wrappers、注入和secret。
- 标清原型单机、未来云/daemon、Watchdog缺失范围；文章开放问题逐个通俗解释。
- 引sessions.ts:152、docs006:19,133,218；README:3,5。

## 附录
- 术语表17项：比喻+精确定义+docs001/source引用，不把Correlation当路由。
- 五目录职责与import单向规则；Setup摘要含状态目录、独立profile、模型、账号、prepare、allowed list、试运行与hourly。
- 引docs001:27-37,80,81,98；docs007:258；SETUP:27,55,74；docs006:73,91,133。


# 第 6 章大纲（阶段 B）
- 用员工手册、岗位卡和办事指南比喻 prompt、角色与 skill；明确文字要求和程序强制的区别。
- 画角色拼装顺序 SVG；解释 Policy 最后、Worker 保留宿主提示词及额外 Mandate、CLI 随 skill 按需加载。
- 逐读全部 15 prompts 与 2 skills，每个 3—6 句真实原句、逐句解释、文章思想与强制代码边界。
- 最后讲文本优先关系、团队可改范围、版本冲突和下一模型请求生效；用错别字票据举例，章末三句小结。


# 领域章节大纲

## 第7章 跟着修错字评论走
- 快递/餐厅订单比喻；Source、Trigger、Thread、Policy、Eval、Mandate、Ticket、Assignment依次落到真实函数。
- 画事件时序SVG；显式@请求由Router route，推断候选才用eval工具，避免把所有请求写成同一路。
- PR评论订阅直通限定人类且归属该工单；bot/CI也可评估；PR先需绑定。区分Ticket stop与全局暂停。
- 引用 github.ts297/399，intake.ts19，evals.ts91/305，tickets.ts37，dsh.ts264/424，executor.ts75，outbox.ts24。

## 第8章 文章×代码总表
- 覆盖双层、批处理、过滤、直通、缓存、主动行动、全双工、多渠道、状态分离、环境分离、Watchdog、实验边界。
- 已实现/部分实现/未实现逐行给理由；未实现限定文章完整机制，无全仓库负断言。
- 修正Watchdog/环境抽象/显式消息路径/批处理范围，引用health.ts15、docs006133、sessions.ts77等。

## 第9章 工程方法
- 账本唯一入口与可测试决策；精确说明“纯函数式”有边界。
- 持久Effects对照内存afterCommit，解释提交后I/O、重试与崩溃窗口；图示事务→队列→外部渠道。
- Pick窄接口，文档meta测试与模型surface预算，用真实片段和具体失败例。
- 引用engine.ts48/261，effects.ts61，store.ts140，tests/docs.spec.ts62，tests/model-surface.spec.ts35。
