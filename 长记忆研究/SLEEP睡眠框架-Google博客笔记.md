# SLEEP 睡眠框架：让大模型在持续学习中保留知识

> 原文：[The sleep framework: A new way for LLMs to retain knowledge in continual learning](https://research.google/blog/the-sleep-framework-a-new-way-for-llms-to-retain-knowledge-in-continual-learning/)
> Google Research 博客，2026-10-27，署名 Ali Behrouz、Vahab Mirrokni
> 论文：*Language Models Need Sleep: Learning to Self-Modify and Consolidate Memories*，[arXiv 2606.03979](https://arxiv.org/abs/2606.03979)，PDF 已存为本目录 `2606.03979v2.pdf`（CC BY 4.0）
> 论文作者：Ali Behrouz（Google / Cornell）、Farnoosh Hashemi（Cornell）、Adel Javanmard（Google / USC）、Vahab Mirrokni
> 本笔记是对博客内容的中文概括，不是原文翻译；精确表述以原文和论文为准。

## 要解决的问题

- 部署后的大模型基本是**静态**的：知识有截止日期，学不到新的长期能力。
- 直接用新数据更新参数，会**灾难性遗忘**：学了新任务，旧任务变差。
- 只靠上下文学习（ICL），记忆只活在上下文窗口里，**会话一结束就丢了**。

## 核心思路：醒着 / 睡觉 两个阶段交替

| 阶段 | 做什么 |
| --- | --- |
| 清醒（wake） | 正常接收输入，把临时信息存进快速的**短期记忆**组件 |
| 睡眠（sleep） | 停止接收新输入，专门做**记忆巩固**和**自我提升** |

博客强调"睡眠""做梦"只是类比：模型架构是固定的，训练规则是人定的。睡眠时模型会解锁**预先分配好的 MoE（混合专家）记忆块**，用自己生成的练习样本更新权重。

## 睡眠的两个步骤

### 1. 记忆巩固（类比非快速眼动的慢波睡眠）

- **参数扩展 + 连续记忆层级**：睡眠时解锁新的低秩专家（MoE + Hope 架构），加到更新频率较低的稳定记忆块里。新知识写进新参数，不覆盖旧参数。
- **知识播种（向上蒸馏）**：把高频层（如上下文记忆）里脆弱的短期记忆，蒸馏进新的长期参数。方法是 GKD（广义知识蒸馏）加基于强化学习的模仿学习：
  - **on-policy 蒸馏**：扩展后的学生模型在自己采样的序列上，学习老师给出的逐 token 分布。
  - **学会模仿（LTI）**：学生补全老师文本的前缀，按语义相似度和编辑距离（Levenshtein）给奖励。
- **突触修剪**：巩固完成后，把高频临时参数清空，腾出容量给下一轮。

### 2. 做梦自我提升（类比快速眼动睡眠）

- **随机选专家**：生成合成数据时，路由器随机激活平时不会用的专家，把不同领域的知识混在一起。
- **筛选复习**：模型生成合成样本（"梦"），用基于梯度的数据选择挑出最可能提升整体能力的那些。
- **微调验证**：用评分最高的梦样本做监督微调，看下游表现有没有变好。（博客把这一步叫 RL refinement，但描述的是监督微调。）

### 理论解释（博客只给结论，没有公式）

- 巩固 ≈ 低秩压缩，同时保住模型的 on-policy 行为和语义奖励信号。
- 参数扩展 = 给新记忆留出空间，不必覆盖旧记忆。
- 做梦 = 让梯度方向更多样（随机专家），再筛选（梯度选择），学习过程更稳定。

## 实验结果（博客给出的数字）

博客没写基座模型、模型规模和算力。第三方资料提到数学实验用的是 Qwen3 1.7B / 8B，未在博客中确认。

| 任务 | 结果 | 对比方法 |
| --- | --- | --- |
| 类增量学习、持续翻译（满语、Kalamang 等未见过的语言） | 多阶段评测中几乎没有性能下降 | ICL、Cartridges、SFT 都遗忘严重 |
| 长上下文 BABILong | 到 1000 万 token 仍接近满分 | 声称超过 GPT-4 和 Titans |
| 事实知识（SQuAD / 继续预训练 CPT） | 单任务 48.9%，CPT 46.2% | 基座、SFT、SEAL |
| 数学推理 | AIME 24 79.2%、AIME 25 69.0%、HMMT 25 46.1% | SFT、GRPO、on-policy 自蒸馏（OPSD） |

## 没说清楚的地方

- 没有局限性章节：模型规模、算力成本、多久睡一次、生产环境表现都没讲。
- 没有给代码仓库。

## 相关工作

- Hope 架构：[arXiv 2512.24695](https://arxiv.org/abs/2512.24695)，本目录已有 `2512.24695v1.pdf`
- Titans：[Google Research 博客](https://research.google/blog/titans-miras-helping-ai-have-long-term-memory/)
- Cartridges：[arXiv 2506.06266](https://arxiv.org/abs/2506.06266)
- SEAL（Self-Adapting Language Models）：[arXiv 2506.10943](https://arxiv.org/abs/2506.10943)
- BABILong：[arXiv 2406.10149](https://arxiv.org/abs/2406.10149)

## 和 dsh-superagent 的联系（我的理解）

SLEEP 的"短期记忆在会话结束就丢"这个问题，和 dsh-superagent 的处理思路刚好是两条路：
- dsh-superagent 不改模型权重，把长期状态存在**外部**：Ticket、Thread、Decision 都在 SQLite 里，worker 恢复时重新读取 Thread。
- SLEEP 是把短期记忆**写进模型参数**里。
