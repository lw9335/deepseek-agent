import fs from 'node:fs';
const svgText=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const ref=(p,l)=>`<a class="ref" href="../dsh-superagent-prototype/${p}#L${l}" data-source="${p}" data-line="${l}">${p}:${l}</a>`;
const box=(c,t)=>`<aside class="${c}">${t}</aside>`;
const source=(s,...r)=>box('source',s+' '+r.map(([p,l])=>ref(p,l)).join(' · '));
const summary=t=>`<div class="summary"><strong>本章小结</strong><p>${t}</p></div>`;
const diagram=(id,title,items)=>`<figure><svg viewBox="0 0 700 ${items.length*94+20}" role="img" aria-labelledby="${id}"><title id="${id}">${svgText(title)}</title>${items.map(([a,b],i)=>`<rect x="18" y="${i*94+10}" width="664" height="68" rx="12" fill="var(--surface)" stroke="var(--line)"/><text x="36" y="${i*94+37}" fill="var(--accent)" font-size="18" font-weight="650">${svgText(a)}</text><text x="36" y="${i*94+61}" fill="var(--text)" font-size="16">${svgText(b)}</text>${i<items.length-1?`<path d="M350 ${i*94+80}v18m-5-6 5 6 5-6" fill="none" stroke="var(--accent)" stroke-width="2"/>`:''}`).join('')}</svg><figcaption>${title}。箭头表示下一步或信息流，图中文字可选择。</figcaption></figure>`;
const article='<a href="https://www.chaincatcher.com/en/article/2300676">文章链接</a>（本次抓取未成功；文章观点与数字按本地任务书第 6 节摘要转述）';
let html=`<section id="intro"><p class="eyebrow">源码导读 · 研究原型 · 中文长文</p><h1>Super-agent 拆解</h1><p class="lead">让一个会写代码的 agent，成为能接住团队消息、安排多项工作、及时交付的系统。</p><div class="five"><h2>一页纸看懂</h2><ol><li>把 agent 想成能读说明书并使用工具的同事：模型负责决定下一步，程序实际执行工具。</li><li>这份原型把工作分给餐厅式的“前台”Router 和“后厨”Worker：前台判断与派工，后厨各自完成一项任务。</li><li>团队消息先经过来源和授权规则，得到一张带范围的工单；已有工作的后续讨论能直接送到相应执行者。</li><li>DeepSeek Harness（DSH）像操作系统，提供会话和工具；superagent 像应用，组织会话、保存工作状态并把结果送回原处。</li><li>文章还提出云端与用户设备分离等方向，而这个公开仓库是本地研究原型，学习时必须把愿景、实现和缺口分开。</li></ol></div>
${source('第 2—5 句的实现依据与边界：',['README.md',5],['README.md',7],['src/core/evals.ts',71],['src/app/sessions.ts',138],['package.json',62])}
${box('definition','先记住三个名字：<b>Session（会话）</b>像一个人的工作笔记本，是 DSH 保存对话并运行 agent 的单位；<b>Router（主 Session）</b>是做路由和判断的会话；<b>Worker（执行器 Session）</b>是为一张工单干活的会话。它们的具体工具在第 5 章对比。')}
<h3>看图前，先认这些名字</h3><p>这些名字分别回答“消息从哪来、属于哪件事、谁能批准、谁负责做、怎样回信”。先看下表的比喻，再看图；后面的章节会用同一条修错字请求把它们串起来。</p>
<table><thead><tr><th>名字</th><th>比喻 → 精确定义</th></tr></thead><tbody>
<tr><td>Source / Trigger</td><td>揽收点 / 新包裹 → Source 是事件流及其实例配置；Trigger 是来源产生的一个不可变事件。</td></tr>
<tr><td>Thread / Subscription</td><td>订单档案 / 通知登记 → Thread 按时间组织事件；Subscription 是 Ticket 与 Thread 的多对多关系，让后续事件送达相关工作。</td></tr>
<tr><td>Policy / gate</td><td>接单手册 / 门口验单 → Policy 是有版本的规则与来源授权配置；gate 是程序执行的第一层准入判断。</td></tr>
<tr><td>Eval</td><td>审单过程 → 把一批事件变成决定的评估过程，包含 gate 和后续判断。</td></tr>
<tr><td>Ticket / Mandate</td><td>订单 / 签好的授权单 → Ticket 是一单位获授权工作；Mandate 不可变地记录其范围、强度和批准依据。</td></tr>
<tr><td>Assignment</td><td>一次派班 → 一张 Ticket 与一个执行器实例的绑定；一张工单可以经历多次派工。</td></tr>
<tr><td>Report / Outbox</td><td>进度回执 / 待寄信箱 → Report 是执行器报告的结构化状态；Outbox 先保存待发消息，再安排实际投递。</td></tr>
<tr><td>SQLite / 工作目录</td><td>可落盘台账 / 工作台 → SQLite 是原型保存领域状态的本地数据库；工作目录是执行器放代码和运行命令的位置。</td></tr>
</tbody></table>
${source('术语规则和相应实现：',['docs/001-domain.md',27],['src/core/model.ts',1],['src/app/outbox.ts',23],['src/app/store.ts',51])}
${diagram('architecture','图 1 · 总架构：消息怎样变成工作',[['GitHub / 飞书 → Source','来源适配器把外部消息转换成事件'],['Thread / Subscription','话题归档；已订阅工作的后续消息可直接送往 Worker'],['Policy gate → Router','程序先做准入；模型再理解请求、接单或忽略'],['Ticket + Mandate → Assignment → Worker','工单记录任务，授权限定范围，派工绑定执行者'],['Report → Outbox → 原对话','结构化报告推动状态；待发消息保存后发送'],['DSH + SQLite + 工作目录','宿主运行会话；原型保存领域状态并组织执行目录']])}
<p>阅读路线：只想理解思想，读第 1—3 章；想追代码，读第 4—9 章；准备部署，务必看第 10 章和附录。提示词是最长的一章，可先读每个文件的作用，再展开原句精读。</p>
${box('warning','证据说明：标“文章设计”的内容描述文章主张；标“原型实现”的内容有代码出处；缺少对应实现会明确写出范围。点击文件行号可在本页查看随报告打包的源码摘录，离线也可核对。文章数字没有在本机复现实验。')}
<p class="muted">${article}。本地版本：package.json 标记 0.1.0 ${ref('package.json',5)}；行号对应本报告读取的工作区快照。</p></section>
<section id="ch1"><p class="eyebrow">01 · 问题</p><h2>为什么一个聊天 agent 不够用</h2>
${box('analogy','想象一个能干的员工：一边接电话，一边修打印机，还要记住上一通电话的要求。即使他更聪明，只要每次都等维修完成才接下一通电话，队伍仍会越排越长。')}
<p><b>模型</b>像能读懂任务的脑子，输入文字后生成回答或工具调用；<b>工具</b>像手边的螺丝刀，由程序执行读文件、运行命令等动作；把“判断—行动—看结果—再判断”反复连接起来，便得到常说的 <b>ReAct 循环</b>。这是帮助理解的通用模型；本仓库调用 DSH 提供的 agent 和 Session 能力，未在这里重新实现整个模型循环。</p>
${source('依赖宿主的 agent、Session 和工具服务，以及创建、装饰会话的调用：',['src/app/sessions.ts',2],['src/app/sessions.ts',140])}
<p><span class="tag">文章设计</span> 作者把瓶颈从“单次任务能否完成”移到“人能否跟得上多个任务”。摘要中的“一个人同时跟进 3—5 个活跃 Session”是作者观察，不是普遍上限。团队需要的是一个可持续联系的同事，而不是让人替每个小任务维护一个聊天窗口。</p>
<table><thead><tr><th>目标</th><th>生活例子</th><th>技术含义与边界</th></tr></thead><tbody><tr><td>Continuous 连续</td><td>上午在前台交代，下午电话追问还能接上</td><td>跨事件保留工作关系；原型用工单、话题和订阅串起后续讨论</td></tr><tr><td>Efficient 高效</td><td>后厨做一道菜时，前台继续接单</td><td>分离路由与执行；多 Worker 按容量并行</td></tr><tr><td>Proactive 主动</td><td>获准巡检后发现问题，先检查再通知</td><td>观察外部事件，按预先写好的规则开始工作；默认观察模式不自动接推断任务</td></tr><tr><td>Persistent 持续</td><td>值班交接读工作台账，不靠记忆重来</td><td>持久化、重启恢复、外部检查；本地进程仍受机器在线状态约束</td></tr></tbody></table>
${source('原型对应：会话创建、订阅扇出、Worker容量、状态保存与重启恢复，以及默认观察模式；后文分别展开。',['src/app/sessions.ts',138],['src/core/intake.ts',38],['src/executor/dsh.ts',166],['src/app/store.ts',47],['src/core/assignments.ts',83],['src/policy.ts',83])}
<p>单个同步循环的困难有三类：等一次长命令时后来的消息排队；多个工作的历史混在一个笔记本里，读到无关内容的机会增多；循环绑在本地机器上时，机器离线就没有执行者。它们都是结构问题。可以改造循环使它异步、拆分上下文并保存状态，因此不能把这些局限说成所有 agent 的必然性质。</p>
${summary('Super-agent 的目标是节省人的协调成本。把不同任务的状态、工具执行和对话组织清楚，才能让模型能力服务于持续工作。')}</section>
<section id="ch2"><p class="eyebrow">02 · 方法</p><h2>把计算机系统的老办法搬过来</h2>
${box('analogy','大型餐厅没有要求每位顾客直接指挥厨师；它用前台、订单、排队规则、备料台和巡店人员组织工作。这里借用操作系统与数据库中的做法，也是给智能体建立这样的组织。')}
<table><thead><tr><th>思想</th><th>在传统系统里</th><th>在这里的映射</th><th>原型边界与出处</th></tr></thead><tbody>
<tr><td>分层</td><td>不同层承担不同职责</td><td>前台路由，后厨执行</td><td>两个 preset、不同工具；Router 仍有 Shell，不能当安全沙箱。${ref('src/app/sessions.ts',46)}</td></tr>
<tr><td>Fast / Slow Path</td><td>常见情况走简单规则，复杂情况付出额外计算</td><td>准入规则先筛；语义研判随后处理</td><td>gate 决定候选资格，模型判断具体需求。${ref('src/core/evals.ts',95)}</td></tr>
<tr><td>缓存</td><td>工作集靠近处理器，冷数据另存</td><td>上下文先放摘要和读取入口，再按需展开</td><td>卡片和分页实现信息组织，不是硬件缓存替换算法。${ref('src/app/cards.ts',9)} ${ref('src/app/cards.ts',89)}</td></tr>
<tr><td>投机执行</td><td>先做可能需要的计算，结果有用才采用</td><td>已获规则授权时先复现、尝试修复，再决定是否打扰人</td><td>需要规则与 auto 模式；并非任意事件都先开工。${ref('src/core/evals.ts',151)}</td></tr>
<tr><td>存算分离</td><td>计算进程与持久数据解耦</td><td>台账与执行器分工，重启时读取任务状态</td><td>原型有SQLite和恢复；云端无状态部署及远端设备协议未由这些接口证明。${ref('src/app/store.ts',47)} ${ref('src/core/assignments.ts',83)}</td></tr>
<tr><td>看门狗</td><td>外部控制者检测失活并处理</td><td>巡查基础设施，也设想审查任务是否有进展</td><td>健康注册表 + 可配置外部小时检查；完整语义监督尚未确认。${ref('src/infra/health.ts',15)} ${ref('docs/006-deployment.md',133)}</td></tr>
</tbody></table>
<p>这些名字只是入口。判断实现时要问“谁保存数据、谁触发动作、谁能拒绝请求”。例如，有一个叫 <code>HealthBoard</code> 的对象，只说明有地方登记健康状态；只有另外的定时机制去读它并作出行动，才形成巡检闭环。</p>
${summary('经典系统思想提供了分工办法；每一种办法都要落到明确的数据和调用上。名称相似，不代表文章中的完整系统已经实现。')}</section>
<section id="ch3"><p class="eyebrow">03 · 概念与实验</p><h2>五个模块怎样协同</h2><p>下面依次介绍双层架构、事件驱动、交互方式、计算与环境分离、看门狗；上下文和投机执行放在事件模块里讲，最后看实验。</p>
<h3>3.1 前台和后厨：Router / Worker</h3>
${box('analogy','前台接到“这一桌少了一双筷子”，先判断找谁处理；后厨负责菜品。让前台亲自炒完一道菜再接待下一桌，就会让所有顾客等待。')}
${box('definition','Router 是主 Session，评估消息、决定工单和路由；Worker 是某张 Ticket 的执行器 Session，拥有自己的执行目录和工作上下文。Ticket 像订单，是一单位获授权的工作；Assignment 像一次排班，把这张订单交给某个执行器实例。')}
${diagram('roles','图 2 · 两层职责',[['Router：理解请求、接单、派工','工具集合较小；新候选和报告进入主 Session'],['Ticket A → Worker A   |   Ticket B → Worker B','每项工作有独立会话与目录；并发受 WorkerSlots 控制'],['执行结果 → 结构化 Report → 状态与消息','原型 Worker 还可调用受限的回复工具；不只是向 Router 说话']])}
${source('两个preset与会话创建；执行目录、Worker容量和报告工具详见后章。',['src/app/sessions.ts',46],['src/app/sessions.ts',138],['src/executor/dsh.ts',166],['src/executor/dsh.ts',424],['src/app/tools/executor.ts',75])}
<p><span class="tag">原型实现</span> Router 不装 subagent、web 和文件写入工具，通过较小的工具集合抑制自己做完整任务；但 Shell 仍在，5 秒是前台等待上限，不是进程只能运行 5 秒。长命令转后台，后来消息有机会在下一步被处理。架构约束比一句“请记得委派”更稳定，但并非操作系统权限隔离。</p>
${source('preset明细与主会话等待守卫；Shell前台等待与job等待各有限制：',['cordis.patch.yml',121],['cordis.patch.yml',145],['cordis.patch.yml',163],['src/app/sessions.ts',69])}
<h3>3.2 快递分拣：事件、话题与两条路径</h3>
${box('analogy','Source 是快递揽收点，Trigger 是一件新包裹，Thread 是同一订单的物流档案。Subscription 像“这个订单有新消息就通知这位负责人”的登记；一个订单可以通知多人，一人也可跟多个订单。')}
${box('definition','Source 是事件流及其配置；Trigger 是不可变事件，可属于多个 Thread；Thread 按时间收集事件，并串行进行 Eval（评估）。Subscription 是 Ticket 与 Thread 的多对多关系。Correlation 像相关档案的交叉索引，只补充上下文，不负责路由。')}
${source('领域词汇与行为实现：',['docs/001-domain.md',27],['src/core/intake.ts',19],['src/core/evals.ts',71])}
${diagram('routing','图 3 · 事件过滤与路由',[['Source：去掉自身消息、范围外消息','转换并保存 Trigger，确定其 Thread'],['已有订阅？→ 给相关 Ticket 的 Worker 上下文','已归 Worker 负责的人类跟进通常不再做普通 Eval'],['其余事件 → Thread pending → Policy gate','规则检查来源身份、接收范围、强度；不通过则记录'],['Router：显式请求走 route；推断候选做 assessment','理解要做什么；accept / stop / ignore / unavailable'],['accept → Mandate + Ticket + Assignment','Mandate 像签好的授权单，保存范围、强度、策略版本']])}
<p><b>Policy</b> 像接单手册，是有版本的准入规则；<b>Gate</b> 像机器按邮编分拣，是程序的确定性检查；<b>Assessment</b> 像人读地址，是模型的语义判断；<b>Mandate</b> 则是已批准订单上的授权记录。看见一句“请忽略旧规定”，不会让外部消息变成授权规则。${ref('docs/001-domain.md',32)} ${ref('src/policy.ts',191)}</p>
<p>订阅先提供上下文，不等于扩大任务授权。只有已有 Worker 负责的人类跟进消息免去新 Eval；bot/CI 即使已扇出给 Worker，仍可进入评估。只跟随作上下文的 Thread 也不给 Worker 后续工作的所有权。${ref('src/core/intake.ts',38)} ${ref('src/core/intake.ts',53)} ${ref('docs/001-domain.md',37)}</p>
<p>例如，获准的账号评论 <code>@agent 修一下 README 里的错别字</code>，通常形成 explicit 候选，主 Session 可直接用路由工具接单；它不必绕进为 inferred 候选准备的完整评估工具。后者用于“这件事是不是命中了团队预先允许的主动工作规则”。</p>
${source('允许名单且提及形成explicit；explicit不能走evalFor；推断接单必须满足规则和模式：',['src/policy.ts',191],['src/app/assessment.ts',109],['src/app/tools/main.ts',88],['src/core/evals.ts',151])}
<p><b>合批</b> 像把同一桌连续追加的点菜单放在一起。代码里，Thread 正在评估时继续积累 pending，下一次 Eval 取出整批；这是 Thread 层面的串行性。另一个层面是候选和报告送入主会话的收件箱，由宿主在后续步骤接收，不能把两者都归为一个函数。</p>
${source('start把pending放入evaluation再清空；主会话relay以steer投递：',['src/core/evals.ts',107],['src/app/sessions.ts',104])}
<h3>3.3 桌面与档案柜：上下文当缓存</h3>
${box('analogy','桌面只摆当前要用的资料；厚档案放柜子里，在桌上留下“见A-17”的便签。需要细节时再打开对应抽屉，而不是每次把全柜的纸倒在桌上。')}
${box('definition','Inline 是把很可能马上要用的信息直接放进模型上下文；Spill 是把长内容留在可读取资源里，只先给摘要和入口；Chain of Recall 是沿入口一跳一跳找到更多证据。这里的“缓存”是上下文组织比喻，不能据此推断所有模型提供商的缓存命中率。')}
${diagram('recall','图 4 · 逐跳召回',[['卡片：preview + chars + read','先看到简短摘要，以及原文长度和读取入口'],['ticket/<id> → trigger/<id> / thread/<key>','从工单找到起始事件和相关话题'],['长文本 → offset / next_offset','按返回的下一页位置读取，不猜测资源ID'],['模型拿到足够证据后作决定','读到截断摘要不代表已经读过完整讨论']])}
${source('真实卡片和分页返回结构：',['src/app/cards.ts',8],['src/app/cards.ts',60],['src/app/cards.ts',89],['src/app/resources.ts',24])}
<details><summary>展开一个真实实现片段：分页不是token截断</summary><div class="codeblock" data-file="src/app/cards.ts:89"><pre><code>export function textPage(resource: string, text: string, offset: number, limit: number) {
  const end = Math.min(text.length, offset + limit)
  return { resource, offset, total_chars: text.length,
    next_offset: end &lt; text.length ? end : null, text: text.slice(offset, end) }
}</code></pre></div><p>这里按 JavaScript 字符串的 UTF-16 单位分页；调用者沿 next_offset 继续即可重建文本，不能把 limit 当模型 token 数。</p></details>
<h3>3.4 先检查再开口：有授权的投机执行</h3><p>像维修员先确认故障能否复现，再决定是否请你停工配合，投机执行让不确定工作先在后台获得证据。原型的对应能力是 inferred 候选、规则研判与 auto 接单模式；默认 observe 只记录“本来会接”，并不启动 Worker。需要团队明确允许静默处理，不能把“主动”理解成擅自改任何仓库。</p>
${source('推断候选接单、observe不启动的硬条件；沟通与交付默认约束由提示词承接：',['src/policy.ts',40],['src/policy.ts',83],['src/core/evals.ts',151],['prompts/team/communication.md',1],['prompts/team/delivery.md',1])}
<h3>3.5 边干边听：全双工和不同渠道</h3><p>打电话时能同时听到对方插话，是“全双工”的生活比喻。文章的异步 <code>start()</code>/<code>stop()</code> 思路是启动长工作后立即把控制权交回，完成时再产生事件，并可取消。原型可以确认后台 job、后续消息投递和等待守卫；不能仅凭 Executor 也有同名 start/stop，就说它完整实现了文章描述的 DSH API。</p>
${source('主会话noWait检查、会话消息投递和后台作业管理：',['src/app/sessions.ts',77],['src/app/sessions.ts',161],['src/executor/background.ts',61],['src/executor/dsh.ts',264])}
<p><b>Channel</b> 像回信地址，是 Thread 的写入侧：在 IM 发短句，在 GitHub PR 写结构化证据。<b>PR（拉取请求）</b> 像把修改放进待审阅托盘，让人看差异和验证结果再决定合并。原型 IM 校验最多 100 个词状片段，使用中文分词器，URL 也计入；它不是“最多100汉字”，也不建议用拆成多条来绕过限制。</p>
${source('分词与校验；渠道与交付要求：',['src/infra/text.ts',2],['prompts/replies.md',27],['prompts/team/delivery.md',1])}
<h3>3.6 总部、台账与现场：计算、状态、环境分离</h3><p>远程维修公司的总部负责安排，台账记录进度，现场设备负责执行。对应地，计算是模型循环，状态是会话和工单，执行环境是代码目录、工具和凭证所在的机器。文章设想云端循环、数据库状态和用户机器上的轻量 daemon（后台服务），让用户自带机器，即 BYOM。</p>
<p><span class="tag">部分实现</span> 原型已经把领域状态与执行器通过接口分开，也持久化任务；执行环境可以配置目录、准备命令和变量。但调用仍连接本地 DSH 与本机命令，这不等于已实现远端 daemon、设备重新上线后续跑的云边协议。</p>
${source('接口和本地执行环境的依据：',['src/core/ports.ts',55],['src/app/store.ts',47],['src/app/execution-environment.ts',27],['src/executor/dsh.ts',424])}
<h3>3.7 巡店员：Watchdog 到底有没有</h3><p>仪表盘会亮红灯，巡店员会看灯、判断问题并处理，两者作用不同。HealthBoard 是前者；部署文档要求用户在另一个 DSH profile 创建 Hourly check，是后者的一种运维实现方案：查状态、必要时重启、保留人为停止。文章进一步设想独立 Session 判断 Worker 是否有实质进展、是否跑偏；未能从本地代码确认这套语义监督已自动接入。</p>
${source('健康项归属与外部检查明确分开：',['src/infra/health.ts',15],['docs/006-deployment.md',133])}
<h3>3.8 实验能告诉我们什么</h3><p><span class="tag">文章实验 · 未在本机复现</span> 摘要描述约 300 条合成消息，其中约 20 条是工作请求；实际编码替换成只花时间的假工具，每方案运行 5 次。因此它检查调度行为，不证明真实编码正确率或生产吞吐量。</p>
<figure><svg viewBox="0 0 700 330" role="img" aria-labelledby="exp-title"><title id="exp-title">图5 实验完成时间，单位分钟</title><text x="20" y="30" fill="var(--text)" font-size="18">完成时间（分钟，越低越好）</text><text x="20" y="72" fill="var(--text)" font-size="16">Super-agent p50</text><rect x="20" y="85" width="248" height="24" fill="var(--accent)"/><text x="280" y="104" fill="var(--text)" font-size="17">12.4</text><text x="20" y="143" fill="var(--text)" font-size="16">Super-agent p95</text><rect x="20" y="156" width="314" height="24" fill="var(--accent)"/><text x="346" y="175" fill="var(--text)" font-size="17">15.7</text><text x="20" y="214" fill="var(--text)" font-size="16">单会话 + Subagent，中性提示词 p95</text><rect x="20" y="227" width="590" height="24" fill="var(--muted)"/><text x="622" y="246" fill="var(--text)" font-size="17">29.5</text><text x="20" y="295" fill="var(--muted)" font-size="15">同一尺度：条长按给定分钟数绘制；未提供的 p50 不补写。</text></svg><figcaption>图 5 · 数字来自任务书第 6 节的文章实验摘要；非原型实测。</figcaption></figure>
<p>p50 像把所有完成时间排序后看中间位置，p95 看更靠近慢端的位置。中性提示词下，5 次实验一次也没委派；“优先委派”提示词使其中 4 次委派，剩下的一次仍由主会话自己做。这支持作者的工程判断：让职责体现在工具和结构里，比仅靠提示词劝说可靠；它不是对所有模型的普遍证明。</p>
<table><thead><tr><th>去掉订阅直通</th><th>摘要给出的变化</th><th>应怎样解释</th></tr></thead><tbody><tr><td>完成时间</td><td>大体相近</td><td>主要收益在Router开销，而非这里的总耗时</td></tr><tr><td>Router决策次数</td><td>约增加30%</td><td>原本由Worker接住的消息需要额外路由</td></tr><tr><td>cache-read token</td><td>2323万 → 3177万，约增加37%</td><td>“去掉后增加37%”不能倒写成“用了节省37%”</td></tr></tbody></table>
<p>多会话也有代价：上下文读取量会增多。另一个 Router 批处理实验把事件到达率从每分钟约 1 条提高到约 40 条；摘要未给图中细节，这里不补造数字。${article}。</p>
${summary('消息先找已有负责人，再判断是否需要新工作；上下文只按需展开。实验支持把委派落实在架构中，同时提醒我们注意多会话的 token 成本。')}</section>`;
fs.writeFileSync(new URL('_main-chapters.html',import.meta.url),html);
