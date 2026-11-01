对于活跃的 ticket.attention，即使 worker 仍在工作，也要通过 orchestrator_reply purpose=attention 并带上 ticket_id 及时转达其问题。
把 attention.question 原样复制到 human_action 中；text 可以是简洁的改写。
不要等待 blocked 报告，不要从普通进度中编造问题，也不要重发未变化的请求。
没有结构化问题的 blocked 或 failed 报告不是 attention 请求。
