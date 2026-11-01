# 插件与部署事实底稿

本底稿由当前工作区逐文件读取并以行号核实；未修改原型。文章地址经 web.open 尝试不可访问，文章相关叙述使用本地任务书第6节的摘要，不以二手报道补充数字。

- 研究原型、非正式产品、不同于内部实现，文章有未来方向未落地：`dsh-superagent-prototype/README.md:3`、`:5`；单GitHub仓库，可选飞书，DSH bundle：`:7`。
- 主插件入口声明依赖 agents/sessionController/sessionPersistence/workspaceRegistry/permissionPresets/tools/systemPrompt/skills/webServer/llm/subprocess，实例化 Runtime 并在 effect 清理时 stop：`dsh-superagent-prototype/src/index.ts:7`、`:8`、`:21`、`:22`。
- Runtime extends Service，`super(ctx, 'orchestrator')` 注册服务；停止时 abort、取消 agent、等待 drain/idle、shutdown executor、dispose sessions、flush 持久化并关Store：`dsh-superagent-prototype/src/app/runtime.ts:59`、`:88`、`:229` 至`:249`。
- package exports 主插件/client/github-watch/feishu-watch：`dsh-superagent-prototype/package.json:11`；bundle patch manifest：`:30`；engines.dsh 是 ^0.2.1-alpha.2：`:53`；依赖 DSH 的 peerDependencies 为宿主共享接口，开发版本固定在 devDependencies：`:62`、`:87`。不能由本仓库单独证明 DSH 的所有内部行为。
- 编译 Node ESM 三入口，依赖 @deepseek-ai/* 不打包；浏览器 CJS client.js 用 window.__ModuleLoader__.load 包装：`dsh-superagent-prototype/tsdown.config.ts:10`、`:11`、`:13`。
- bundle insert 主插件+GitHub+Feishu，飞书disabled true，需要另配bot CLI：`dsh-superagent-prototype/cordis.patch.yml:4` 至`:12`；worker preset：`:20`；router：`:125`。
- Worker shell超5秒转后台而非任务限5秒：`dsh-superagent-prototype/cordis.patch.yml:38` 至`:74`；有文件写/搜索、todo、spawn子agent standard、web search但fetch false：`:63`、`:96` 至`:119`。
- Router 仍有 shell，具有read/skills/jobs，文件write/edit false，没有subagents/web/file search/todo：`dsh-superagent-prototype/cordis.patch.yml:121` 至`:193`。是工具集合约束，不能说安全隔离或绝对无法用shell修改文件。
- 创建 Session 指定preset，设置danger-full-access：`dsh-superagent-prototype/src/app/sessions.ts:138` 至`:153`；UI误选preset时恢复：`:122` 至`:130`；注册工具：`:206`；动态systemPrompt.section且仅master complete true：`:244` 至`:249`；Router工具restrict与noWait guard：`:263`；guard拒绝sleep、bash timeout>30s、job wait>5s：`:69` 至`:85`。guard是所写参数/模式检查，不可宣传为完整sandbox。
- Github Source只注入orchestrator，注册kind且 effect 返回AbortController清理函数：`dsh-superagent-prototype/src/sources/github.ts:110` 至`:120`；飞书同结构：`dsh-superagent-prototype/src/sources/feishu.ts:130` 至`:140`。
- 面板通过slots注册main、sidebar.panellist、plugins.row.config，locale effect：`dsh-superagent-prototype/src/client/index.tsx:48` 至`:57`。
- SourceRegistry.register返回删除kind、释放health和注销通知的清理函数：`dsh-superagent-prototype/src/sources/registry.ts:19` 至`:34`；Worker读DSH编码提示词和仓库AGENTS.md、主Session不读：`dsh-superagent-prototype/docs/004-prompts.md:61`。
- 机器stateDir/limits在plugin配置，repository/accounts/Policy/execution在面板：`dsh-superagent-prototype/docs/006-deployment.md:11`；profile patch另设webserver host/port：`:91`，示例 `examples/profile.cordis.patch.yml:3` 至`:12`。stateDir必填数据库等目录：`:95`。
- 专用profile是因为进程PATH/git改动和独立重启；两个preset均操作员OS用户danger-full-access、账号wrapper不隔离、worker能读home：`dsh-superagent-prototype/docs/006-deployment.md:7`、`:19`。实际权限设置：`src/app/sessions.ts:152`。
- 部署需模型provider、Node/git/gh等，GitHub Enterprise不支持：`dsh-superagent-prototype/docs/006-deployment.md:23` 至`:27`；新profile创建命令覆盖已存在profile配置，不可用作升级：`:73` 至`:87`。
- SETUP一次短问一个非秘密问题；不能在聊天收secret：`dsh-superagent-prototype/SETUP.md:13`；准备/默认配置和最终验证：`:27`、`:55`、`:74`。报告只概述，不实际部署，无需执行SETUP审批流程。
- 环境shim选择agent CLI，git配置替换个人配置并去掉GH_TOKEN/GITHUB_TOKEN，setup过滤敏感环境变量名：`dsh-superagent-prototype/docs/006-deployment.md:218` 至`:227`。这些减小误用，并不阻止读取磁盘secret。
- 更精确的源码边界：agentVariables明确移除GH_TOKEN/GITHUB_TOKEN和个人git环境覆盖：`dsh-superagent-prototype/src/infra/environment.ts:45` 至`:56`；`runAsWorker`通过DSH subprocess.spawn运行：`:127` 至`:129`，credential形变量过滤内部实现不在本仓库，不能声称已独立验证。
- Hourly check在操作者日常profile而非superagent，每小时status，人工stop保持，故障按退出码区别处理：`dsh-superagent-prototype/docs/006-deployment.md:133` 至`:141`；这是部署者需另设的外部健康恢复回路，不能说原型完全没watchdog思想，也不能说已实现文章独立语义监督Session。
- 最终复核的实现锚点：Runtime opens SQLite：`dsh-superagent-prototype/src/app/runtime.ts:98`；Effects写SQL effect：`dsh-superagent-prototype/src/app/effects.ts:61`；本机workspace与ensure worker：`dsh-superagent-prototype/src/executor/dsh.ts:432`；HealthBoard纯状态registry：`dsh-superagent-prototype/src/infra/health.ts:15`；人工停止标记跳过恢复：`dsh-superagent-prototype/scripts/dsh-superagent:232`。
- docs术语Source/Trigger/Thread/Correlation/Channel/Policy/Eval/Mandate/Ticket/Assignment/Subscription精确定义：`dsh-superagent-prototype/docs/001-domain.md:27` 至`:37`；Main/Executor Session：`:80`、`:81`；Executor：`:98`。Correlation只加上下文不路由，Subscription路由；Ticket≠Session；Mandate不可变且只有person stop撤回/Policy失效可撤销。
- 目录import规则：core除hash外不出域且无I/O；sources不import app；client只host types+小白名单：`dsh-superagent-prototype/docs/007-architecture.md:258`。源码映射：`:293` 起Modules表。
- docs.spec索引所有src/test且只列存在文件：`dsh-superagent-prototype/tests/docs.spec.ts:58`、`:63`；model-surface实际collect两角色tools/prompts/skills/inputs，检查命名/枚举/角色/词数与预算：`dsh-superagent-prototype/tests/model-surface.spec.ts:350`、`:369`、`:377`、`:389`。测试不是语义正确性的证明。
- Source扩展步骤和构建注册：`dsh-superagent-prototype/docs/008-cookbook.md:1`（全文已通读；最终引文按源文件定位）。新增kind需定义schema/scope/trigger/channel/threadContext/policy/environment/health、轮询游标和abort，再加build/export/patch和测试。

## 对笔记/任务书的纠正

1. “Router没有Bash”仅是文章可选设计；原型有shell，只缩减工具并避免等待。
2. “5秒shell”表示前台等待阈值，非命令或整个任务强制5秒终止。
3. “原型完全无Watchdog”过满：有HealthBoard和另profile的Hourly check，但没有证据证明文章式独立Session监督任务实质进展并自动改prompt。
4. “IM不超过100字”应按实现wordCount/IM_WORDS口径解说；中文不能直接等同英文空格词数。具体限制由prompt审计负责。
5. “计算/执行环境完全没有分离”过满：有core ports、Executor适配、目录/环境配置；未找到云端Loop+本地daemon/BYOM远程协议实现。
6. “直通省37%token”分母错误：摘要给的是关闭直通后cache-read上升约37%，不应反向说开启直通比关闭节省37%。
