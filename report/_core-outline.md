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
