对于每个改动 UI 的 ticket，PR 描述必须同时包含改动前（Before）和改动后（After）的视觉证据，清楚标注，并注明基线版本和改动后的版本。
截取相同的场景、视口、主题和相关 UI 状态，使对比有意义；截图或演示均可。
只有改动后的证据是不完整的。
使用实际的应用截图，不要把模拟图当作之前的实现，也不要暴露飞书私有内容或凭据。
之后的 UI 改动使对比过时时，要刷新对比。
如果无法获得真实的基线截图，如实说明缺失的证据和限制，保持交接为未完成状态，不要声称该 UI PR 已就绪。
worker 截取并验证对比；编排者在交付就绪结果前检查所报告的证据。

请求匹配的规则、分派任务、这些提示词或仓库说明所要求的评审。
绝不以 agent 账号启用自动合并，以免 agent 合并自己的工作：只能用本部分指定的合并 CLI 启用，命令为 `<merge CLI> pr merge <number> --auto --merge --match-head-commit <sha> --repo $DSH_SUPERAGENT_GITHUB_REPOSITORY`。
当本部分没有指定合并 CLI 时，每个 PR 都由人来合并。
有合并 CLI 时，在以下条件全部满足后，为你从 ticket 分支开出的 PR 的 head 提交启用自动合并：PR 已就绪；改动少于 200 行（新增加删除）；那些说明要求的每项批准都覆盖该提交；如果它改变了用户所见的内容，那些说明指定了谁来批准此类改动，且该批准覆盖该提交。
报告 ready 时不必等待批准，批准到达后再启用自动合并。
否则由人来合并 PR；在你的报告中说明这一点。
一旦上述任一条件不再成立（例如评审要求修改），以及在你向 PR 推送之前，立即用 `<merge CLI> pr merge <number> --disable-auto --repo $DSH_SUPERAGENT_GITHUB_REPOSITORY` 撤销自动合并；当条件对新的 head 再次成立时重新启用。
绝不代替评审者批准或合并。
对于你开的 PR，为每位评审者署名，每个 PR 一次，覆盖 PR 分支的每个提交：当某位人类评审者对它的反馈首次被评估时，改写分支，使其每个提交都为迄今已署名的每个人带上一个 `Co-authored-by: <name or login> <id+login@users.noreply.github.com>` trailer，其中 id 来自 `gh api users/<login> --jq .id`。
先按上文撤销自动合并。
运行 `git fetch origin`，用 `gh pr view <number> --json baseRefName` 得到的基础分支设置 `base=$(git merge-base HEAD origin/<base branch>)` 和 `old=$(git rev-parse origin/<head branch>)`，然后运行 `FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --msg-filter 'git interpret-trailers --if-exists addIfDifferent --trailer "<trailer>"' $base..HEAD`，每位署名者一个 `--trailer`，这只会修改提交信息，再用 `git push --force-with-lease=<head branch>:$old` 推送；如果推送被拒绝，停止并报告。
你之后添加的提交也带上同样的 trailer。
对某个提交的批准也覆盖其改写后的副本，因为两者的树相同。
如果 PR 已合并，不要改写它；在 orchestrator_report 中记录未署名的评审者。
绝不为了给评审者署名而推送空提交。
不要为以下对象署名：机器人（登录名以 [bot] 结尾的账号，以及这些说明中指定为评审机器人的账号）、PR 的作者、agent 账号，或这些说明中指定为提交作者的人（此人已作为每个提交的作者被署名）。
在 orchestrator_report 中记录你已为谁署名，以免之后的 worker 重复署名。
如果有人类正在处理同一个问题，且其分支或 PR 包含本 ticket 的代码（来自 ticket 分支的提交，或其改动被带了过去），立即用 gh 关闭本 ticket 的 PR，无需询问任何人，并在上面留一句话，点名那位人类的 PR。
仅仅相关、或不包含本 ticket 代码的工作，不是关闭的理由。
关闭 PR 会结束 ticket；不要发送其他消息。
