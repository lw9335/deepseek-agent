# 006 部署

用本指南安装、配置和运维 dsh-superagent。它涵盖账号、启动检查、升级和故障排查，建立在 [001 领域模型](001-domain.md) 到 [005 面板](005-panel.md) 之上。

## 运行的内容

- **一个专用的 DeepSeek Harness profile**，本指南中称为 `superagent`。从 Web profile 模板创建它。它加载这个 bundle，并在 `127.0.0.1` 上提供面板。把它和你日常工作用的 profile 分开：插件会修改进程范围的 `PATH` 和 git 设置，而且它的进程需要独立地重启和升级。
- **一个 agent GitHub 账号。** agent 以这个账号评论、推送分支和开 pull request，使用一个只登录了该账号的 GitHub CLI。
- **可选：** 一个用于聊天请求的飞书机器人。

插件配置保存状态目录和机器限制。其他所有设置都用面板：Sources 设置仓库和账号，Policy 设置允许名单，Execution 设置 worker 目录和命令。

### 权限与隔离

bundle 为 Executor 定义了 `dsh-superagent-worker`，为主 Session 定义了 `dsh-superagent-router`。它们出现在 DeepSeek Harness 的预设列表中，但只供 dsh-superagent 使用。不要在个人 Session 中选用它们，也不要禁用它们的配置行。应用需要它们来创建和恢复其 Session。

在 Web UI 中打开一个空白的托管 Session 时，可能会选中 profile 的默认预设。dsh-superagent 会在第一轮之前恢复其角色专用的预设。

两个预设都以操作者的操作系统用户身份、以 `danger-full-access` 运行，并读取订阅 Thread 上的消息。账号包装器默认选择 agent 的凭据；它们并不隔离进程。worker 可以按路径执行程序，并读取操作者的主目录。如需隔离，请使用一个只包含 agent 凭据的专用操作系统账号。

## 前置条件

- Node.js 22.19+ 或 24+、pnpm、git 2.32+、Python 3.8+ 和 tmux
- GitHub CLI（`gh`）2.48 或更高版本。Source 的 CLI 字段必须指向 `gh` 或 `lark-cli` 的包装器；宿主依赖它们的子命令和输出格式。
- 一个在 github.com 上的仓库；不支持 GitHub Enterprise Server。要为每个 Ticket 创建一个检出，请保留一个本地克隆，准备命令可以从中添加 worktree。如果该仓库使用 Git LFS，请安装 `git-lfs`。
- 为 DeepSeek Harness 配置好的模型提供方。dsh-superagent 使用 profile 的默认模型，除非 Eval 或 Execution 设置指定了别的模型。
- 飞书需要：`lark-cli`（用 1.0.90 测试过），以及一个带机器人的飞书或 Lark 应用

## 账号

### Agent GitHub 账号

1. 为 agent 创建一个 GitHub 用户账号，并给它仓库的写权限。GitHub App 不能作为 agent，因为 dsh-superagent 会读取该账号的通知。
2. 给它一个只使用它自己凭据的 GitHub CLI：

   ```sh
   mkdir -p ~/.local/bin
   cat > ~/.local/bin/gh-agent <<'EOF'
   #!/bin/sh
   GH_CONFIG_DIR="$HOME/.config/gh-agent" exec gh "$@"
   EOF
   chmod +x ~/.local/bin/gh-agent
   gh-agent auth login
   gh-agent api user --jq .login
   ```

   以 agent 账号登录；最后一条命令会打印其登录名。dsh-superagent 也以同样的方式读取登录名。

### 飞书机器人（可选）

1. 创建一个具备机器人能力的自建应用。授予它接收消息事件、读取和发送群消息、读取群成员的权限，然后发布应用版本。
2. 给机器人一份它自己的、仅限机器人身份的 `lark-cli` 配置，以及一个包装器：

   ```sh
   LARKSUITE_CLI_CONFIG_DIR="$HOME/.lark-cli-dsh-superagent" lark-cli config init --app-id <cli_…> --app-secret-stdin
   LARKSUITE_CLI_CONFIG_DIR="$HOME/.lark-cli-dsh-superagent" lark-cli config strict-mode bot --global
   cat > ~/.local/bin/lark-bot <<'EOF'
   #!/bin/sh
   export LARKSUITE_CLI_CONFIG_DIR="$HOME/.lark-cli-dsh-superagent"
   exec lark-cli "$@"
   EOF
   chmod +x ~/.local/bin/lark-bot
   ```

   第一条命令从标准输入读取应用密钥。请使用一个单独的配置目录：`lark-cli` 每个 app id 只允许一份 profile，而你的个人配置里可能已经有该应用的用户登录。

   宿主会拒绝能以用户身份行事的 CLI。它从机器人配置中读取 app id、飞书/Lark 品牌和机器人的 `open_id`。

   两份配置共用钥匙串中应用密钥的条目。要只删除机器人配置，请删除它的目录；不要运行 `lark-cli config remove`，那会影响共享的密钥。

## 安装

在一台还没有 `superagent` profile 的机器上，运行一次这一段：

```sh
npm install -g @deepseek-ai/dsh@0.2.1-rc.3
git clone <this repository> dsh-superagent && cd dsh-superagent
pnpm install && pnpm build
dsh superagent --from-default-profile web --dump-config > /dev/null
dsh plugin --profile superagent add "link:$PWD"
```

上面固定的版本是公开的；其他版本必须满足 `package.json` 中的 `engines.dsh`。

第四条命令从 DeepSeek Harness Web 模板创建 `~/.dsh/profiles/superagent`。第五条安装这个 bundle。设置 `DSH_HOME` 可以把默认的 `~/.dsh` 目录换到别处。

只在全新安装时运行创建 profile 的命令。如果 profile 已存在，该命令会替换它并删除其 `cordis.patch.yml`，包括机器配置。不要在升级时使用它。

## 机器配置

把 [examples/profile.cordis.patch.yml](../examples/profile.cordis.patch.yml) 复制到 `~/.dsh/profiles/superagent/cordis.patch.yml`，替换掉那个文件，并替换每个 `<placeholder>`。如果用飞书，还要启用其中的 `dsh-superagent-feishu` 条目。`webserver` 条目设置面板的端口。

| Key | 必需 | 含义 |
| --- | --- | --- |
| `stateDir` | 是 | 绝对路径：数据库、锁、`worker-bin` 中的命令垫片、agent 的 git 配置，以及默认放在 `work` 中的 Ticket 目录。升级前请备份 |
| `promptMaxChars`、`admissionContextMaxPages`、`admissionContextTimeoutMs` | 否 | 已保存提示词配置的最大大小，以及一次研判在多长时间内读取多少页 Thread |

首次启动后，在 **Settings → Deployment** 或 DeepSeek Harness 插件管理器中编辑机器限制。改动无需重启即生效。`stateDir` 不能在那里修改。无效的值或未知的配置 key 会阻止启动；日志会指出是哪个 key。

## 启动与停止

```sh
scripts/dsh-superagent start
scripts/dsh-superagent status
```

`start` 在 tmux 会话 `dsh-superagent`（其他 profile 则为 `dsh-<profile>`）中运行 `dsh --profile superagent`。它最多等待一分钟，直到运行时就绪或报告一个设置要求。首次运行时，它会打印缺失的设置信息。它会拒绝重复的实例，包括在这个脚本之外启动的实例。

`stop` 和 `restart` 请求优雅关闭，并为 Executor 最多等待五分钟。它们从不强制杀掉进程，也不碰其他 tmux 会话。

`status` 打印进程 id、健康状况和设置问题。对于其他 profile 或端口，使用 `--profile` 和 `--url`，或设置 `DSH_SUPERAGENT_PROFILE` 和 `DSH_SUPERAGENT_URL`。

`status`、`start` 和 `restart` 以四种退出码之一退出：

| 退出码 | 含义 |
| --- | --- |
| 0 | 服务正常运行 |
| 1 | 它没有运行、运行了两份、没有响应，或其运行时报告了错误；重启可能会修复 |
| 2 | 它在运行，但运行时以外的某个部分，例如某个 Source 或某次 Policy 同步（`sync:<source id>`），报告了错误；重启无法修复 |
| 3 | 它在运行并等待设置；重启无法修复 |

仍在启动中的 Source 算作正常运行。设置无法检查的飞书机器人也是如此。

`status` 在 `errors` 下返回失败的部分及其详情，在 `setup` 下返回设置要求。`start` 和 `restart` 把这些问题逐行打印出来；如果服务始终没起来，它们以 1 退出。只有有意的 `stop` 会暂停自动恢复。

每个 profile 把日志和控制文件存放在 `.artifacts/` 下：

- 启动日志：`dsh-superagent-<profile>-<date>-<time>-<pid>.log`，其中 pid 属于脚本。保留最新的 20 个。
- 控制文件：`control/profiles/<profile>/`，包含停止标记、锁和进程 id。

打开日志中打印的 URL，然后在侧边栏中选择 **Superagent**。

### 每小时检查

在你平时使用的 DeepSeek Harness profile 中创建每小时检查，而不是在 `superagent` 中。它必须在 agent 服务宕机时也能继续运行。让该 profile 中的一个 agent 用以下提示词（填入检出路径）创建一个每小时的计划任务：

```text
Check dsh-superagent: run `scripts/dsh-superagent --profile superagent status` in <checkout>. Exit 0: do nothing and say nothing. Exit 2: do not restart; tell me each part under `errors` with its detail, unless you already told me about the same ones. Exit 3: do not restart; tell me what `setup` says setup needs, unless you already told me. If it reports manually_stopped: true, leave it stopped. Otherwise (exit 1) run `scripts/dsh-superagent --profile superagent --respect-stop restart`, which exits the same way: 0 means it recovered, so say nothing; 2 and 3 are reported as above; if it exits 1 or fails otherwise, read the newest .artifacts/dsh-superagent-superagent-*.log and the Troubleshooting section of docs/006-deployment.md, fix what you can, and tell me what was wrong and what you did.
```

`--respect-stop` 会保留有意的停止。只有 `stop` 会写入标记；`start` 会清除它。`restart` 不写标记，所以检查可以恢复一次关闭超时的重启。

## 设置

必须先设置成功，轮询和工作才会开始。Overview 列出缺失的要求并链接到对应设置。修改设置会再次运行设置检查。如果你在应用之外修复了某些东西，例如 CLI 认证，请选择 **Check again**。

1. **Sources。** 设置 GitHub 仓库（`owner/name`）和 agent CLI，例如 `/home/me/.local/bin/gh-agent`。请求通常通过 agent 账号的通知到达。@ 了该账号的新 Issue 或评论会在下一次轮询时到达；通过编辑已有 Issue 正文来添加 @ 则不会。请改为发一条新评论。如果用飞书，设置机器人 CLI、群、每个群的"接收全部"或"仅 @"模式，以及是否接收私信。
2. **Policy。** 两条示例规则可以编辑或删除。在 **On each Source** 下，添加可以请求工作的 GitHub 账号和飞书用户；在名单里有人之前，任何请求都不能成为 Ticket。如果用飞书，可以选一个群来同步名单，在启动时和点击 **Sync now** 时同步。
3. **Execution。** 目录根和准备命令。要给每个 Ticket 一个仓库检出：

   ```sh
   git -C /home/me/src/widgets fetch --no-tags "https://github.com/$DSH_SUPERAGENT_GITHUB_REPOSITORY.git" "${DSH_SUPERAGENT_GITHUB_PR_HEAD:-HEAD}:refs/dsh-superagent/$DSH_SUPERAGENT_TICKET" &&
   git -C /home/me/src/widgets worktree add -b "agent/$DSH_SUPERAGENT_NAME" "$DSH_SUPERAGENT_DIR" "refs/dsh-superagent/$DSH_SUPERAGENT_TICKET"
   ```

   把个人的 CLI（例如登录了你自己账号的那个）列为禁止的命令。
4. **Prompts。** 设置团队部分：GitHub 披露行、评审机器人、提交作者和自动合并条件。

### 管理 API

面板使用一个本地 HTTP API，agent 也可以调用它。`SETUP.md` 用它保存设置，服务脚本会读取 `GET state`。

把请求发送到 `http://127.0.0.1:<port>/orchestrator/api/`，并带上 `x-orchestrator-request: 1`。host 必须是 `127.0.0.1:<port>` 或 `localhost:<port>`。缺少请求头或 `Origin` 来自其他站点的请求会收到 403。

API 保存拥有面板的权限。与通过主 Session 的工具做的保存不同，它们可以修改执行环境和设置账号字段。

agent 可以依赖这些路由和字段。`src/app/api.ts` 中的其他路由服务于面板，并随面板变化。

| 请求 | 响应 |
| --- | --- |
| `GET state` | 每个页面都会读取的内容：`setup`，带 `problem` 和 `feishuProblem`，每个为 `null` 或一个带 `place`、`code`、`values` 和 `detail` 的设置问题，以及设置解析出账号后的 `accounts`；`health`，每个部分一个条目（见下文），带 `state`（`starting`、`ready`、`paused` 或 `error`）、`detail` 和 `at`；`load`，即 `running` 的 Executor Session、`queued` 的 Ticket 和 `maxWorkers`；`paused`；以及 `masterId` |
| `GET settings` | `blocks`：`policy`、`eval` 和 `executor`，每个带其 `value` 和 `revision`；`sources`：Source 实例，每个带 `id`、`kind`、`installed`、其区块的 `value`（`{"enabled": …, "config": {…}}`）和 `revision`、其 kind 的表单，以及有设置问题时的 `problem`；`policyVersion`；以及 `environment`，即执行环境的 `root` 和 `variables` |
| `GET sources` | 每个 Source 的状态：`state`（`missing`、`off`、`error`、`setup`、`starting`、`paused` 或 `ready`）、其各部分的 `health`、其设置 `problem`、过去一天的 `stats`、它在那一天 `filtered` 的 Trigger，以及它在那一天 `dropped` 的消息（最新丢弃的在前），每条带其 `channel`、`preview`、所属的 `ticket`（`id` 和 `title`）、存储中有时的 `thread`，以及 `dropped.at` 和 `dropped.reason`（`channelGone` 或 `channelIgnored`） |
| `PUT settings/<block>`，带 `{"value": …, "revision": n}` | 保存一个区块：`saved`、区块的新 `revision`、`policy_changed` 和 `restarting`。`value` 是整个区块，与 `GET settings` 中的一致；缺失的 key 取默认值 |
| `POST executor/pause`，带 `{"paused": true}` 或 `false` | 暂停或恢复处理：`paused` |
| `POST setup/check` | 通过重启 dsh-superagent 再次运行设置：`restarting: true`。当设置没有需要修复的东西时会被拒绝 |
| `POST policy-sync/<source id>` | 立即同步该 Source 的允许名单：`policy`，即已保存的该 Source 部分 |
| `GET prompts`、`PUT prompts`，带 `{"config", "baseRevision"}` | 读取提示词配置：`current`（带其 `revision` 和 `config`）、`defaults`、`sections`（按 Session 读取顺序排列的团队部分）、`skillName`（团队 skill 名称的模式）、`builtin`（团队 skill 不能使用的名称）和 `skillPrefix`（Session 加载 skill 名称时使用的前缀）。或者保存它：新的 `revision` |
| `POST tickets/<id>/retry`、`POST tickets/<id>/stop` | 重试或停止一个 Ticket，与面板的操作相同 |

健康条目按职责分组：

| 条目 | 报告 |
| --- | --- |
| `runtime` | 应用本身 |
| `models` | 正在等待模型预算重试的 Session |
| `evals` | 过去一小时内、之后没有判断或忽略的 unavailable Eval |
| `assessment`、`launch`、`delivery`、`relay`、`notice`、`reply` | [003 执行](003-execution.md) 中描述的存储工作；delivery 计算等待中的工作，reply 涵盖 Channel 消息 |
| `worker` | Executor Session 的事件处理；在其首次失败后出现 |
| `github`、`feishu`、`history` | Source 轮询、事件和历史恢复 |
| `sync:<source id>` | 允许名单同步 |

拒绝会带有一个状态码和 `error`（其英文文本）：

- 400：无效的值（`issues`，每项带其 `path`）、账号检查失败（`setup`）、固定的拒绝（`code` 和 `values`），或者请求体不是 JSON 或太大。
- 404：不存在的东西。
- 409：过时的修订。
- 500：其他任何情况。

各区块：

- `source:github`、`source:feishu`：`{"enabled": true, "config": {…}}`。GitHub 的 config 有 `repository` 和 `cli`，以及开关 `observeIssues`、`observePulls`、`observeComments` 和 `observeCi`（默认关闭），它们分别接收仓库中的每个新 Issue、新 pull request、评论和默认分支的 CI；飞书的 config 有 `cli`、`chats`（形如 `[{"chatId": "oc_…", "name": "…", "listen": "mentions"}]`，或 `"all"`）、`directMessages`，以及 `otherChats`（`"none"` 或 `"mentions"`）。
- `policy`：`{"rules": […], "sources": {"github": {"allowed": [{"id": "<login>"}], "bots": [{"id": "dependabot[bot]"}]}, "feishu": {"allowed": [{"id": "ou_…", "name": "…"}], "syncChat": "oc_…", "admission": {"oc_…": {"unlistedAddressed": "explicit"}}}}}`。`bots` 列出其消息可以成为推断候选的机器人。`admission` 的行，在飞书中以群 id、`other` 或 `direct` 为 key，在 GitHub 中以 `issues`、`pulls`、`comments` 或 `ci` 为 key；未设置的单元格取默认值（见 [002 授权](002-authorization.md)）。
- `eval`：`mode`、`timeoutSeconds` 和 `model`。
- `executor`：`model`、`maxWorkers`、`directory`、`prepare` 和 `blockedCommands`。处理暂停是一个独立的设置 `paused`，由 `POST executor/pause` 设置。

修改仓库或 CLI 会先运行对应的设置检查。检查失败会返回 400，详情在 `setup` 中。账号修改成功，或在设置未完成时做的任何保存，会返回 `restarting: true`。应用重启期间 API 暂时不可用。

```sh
api=http://127.0.0.1:3082/orchestrator/api
rev=$(curl -s -H 'x-orchestrator-request: 1' $api/settings | jq '.sources[] | select(.id == "github") | .revision')
curl -s -X PUT -H 'x-orchestrator-request: 1' -H 'content-type: application/json' $api/settings/source:github \
  -d "{\"value\": {\"enabled\": true, \"config\": {\"repository\": \"acme/widgets\", \"cli\": \"$HOME/.local/bin/gh-agent\"}}, \"revision\": $rev}"
```

## 设置检查

设置检查使用 DeepSeek Harness 的子进程服务，与 worker 的 shell 一样。它会移除名称中包含 KEY、PASSWORD、SECRET 或 TOKEN 的环境变量。

设置检查会验证 GitHub 仓库和 agent 的推送权限，写入 worker 环境，并检查 git 对 github.com 只使用 agent 的凭据。飞书设置失败只会禁用飞书 Source。

设置检查写入的进程环境：

- **命令垫片**，位于 `<stateDir>/worker-bin`，在 `PATH` 中排第一：`gh` 运行 agent 的 CLI；`lark-cli` 运行机器人的 CLI；被禁止的命令会失败。垫片在运行其目标之前，会把自己的目录从 `PATH` 中移除。
- **git 配置**，位于 `<stateDir>/worker-gitconfig`：替代操作者的全局和系统 git 配置。它把 agent CLI 选为 github.com 的凭据助手，把 GitHub SSH 地址改写为 HTTPS，并定义 Git LFS 过滤器。HTTP 代理等个人 git 设置不适用。这里不设置提交身份，git 从不提示输入凭据，`GH_TOKEN` 和 `GITHUB_TOKEN` 会被移除。

`worker-bin` 或 `worker-gitconfig` 中不是 dsh-superagent 写入的文件会阻止设置。如果 Ticket 目录位于一个其自身配置添加了凭据的 git 仓库中，该 Ticket 会失败。

## 试一试

从一个被允许的 GitHub 账号，开一个 Issue 或发一条包含 `@<agent login> <request>` 的评论。在一个轮询间隔内（默认一分钟），Overview 应该会显示一个 Ticket。agent 会确认请求，在它自己的 Session 和目录中工作，并在原始对话中交付。如果用飞书，在已配置的群中 @ 机器人。

## 升级

1. 等到没有 Executor 正处于一轮的中间。
2. 备份 `<stateDir>/orchestrator.sqlite`。
3. 运行 `git pull && pnpm install && pnpm build`。
4. 运行 `scripts/dsh-superagent restart` 并检查其状态。

重启会结束正在运行的 Assignment，并带着恢复说明启动替代的 Assignment。团队文本和被覆盖的提示词部分会被保留；没有覆盖的部分会跟随新的默认值。升级后请检查标为 **Default updated** 的部分。

被新版本迁移过的数据库不能被旧版本打开。因此回滚需要升级前的备份。升级 DeepSeek Harness 本身之后，请重启正在运行的实例，让面板加载匹配的产物。

### Agent 预设

worker 和 router 预设会在 5 秒后把 shell 命令转到后台。没有其预设，Session 无法加载。在其 Session 仍在使用期间，请保留 `cordis.patch.yml` 中 `dsh-superagent-worker` 和 `dsh-superagent-router` 这两行；否则恢复会以 `agent-preset/not-found` 失败。

## 故障排查

设置问题会以面板的语言显示在概览中，并带有修复链接；日志和 API 显示下面的英文文本。

| 症状 | 原因与修复 |
| --- | --- |
| `The agent GitHub CLI is not set.` | 在 GitHub 卡片上设置 agent 的 CLI |
| `The agent GitHub CLI was not found.` | 设置包装器的绝对路径，或 `PATH` 上的命令名 |
| `The agent GitHub CLI cannot read its account` | 用 `auth login` 让包装器登录 |
| `@… cannot read …` 或 `@… cannot push to …` | 给 agent 账号仓库的写权限 |
| `The GitHub Source names no repository.` | 在 GitHub 卡片上设置仓库，`owner/name` |
| Ticket 以 `The prepare command failed: …` 失败 | 输出会指出原因，例如克隆路径错误；修复命令，然后重试该 Ticket |
| `git does not read the github.com credential configuration dsh-superagent writes` | 安装 git 2.32 或更高版本 |
| Ticket 以 `The git configuration of the repository in … sets …` 失败 | 从克隆的 `.git/config` 中移除指出的凭据或 `http.*.extraheader` 设置 |
| `… was not written by dsh-superagent` | 把指出的文件移出 `<stateDir>/worker-bin` 或 `<stateDir>/worker-gitconfig`，或选择另一个 `stateDir` |
| `The bot lark-cli allows user identities` | 让飞书 Source 指向一份仅限机器人的配置，如上文"飞书机器人"所述 |
| `The bot lark-cli does not work.` 或 `The bot identity of app … is …` | 检查配置的 app id 和密钥 |
| `The Feishu bot is not a member of the chat.` | 在群设置中把机器人加入该群；下一次尝试就会成功 |
| `status` 以 2 退出 | 某个部分报告了错误，重启无法修复：`errors` 列出每个部分（见"管理 API"）及其详情；每个部分恢复正常后会清除自己的条目 |
| `status` 以 3 退出 | 设置在等待：`setup` 说明缺什么，概览会链接到修复它的设置 |
| `status` 以 1 退出 | 服务没有运行、运行了两份、没有响应，或其运行时报告了错误；输出和最新日志会说明是哪种 |
| `… timed out after 90 s`、`… was stopped by …`、`… exited with code …` 或 `… could not run: …` | 某个 CLI 失败了但没有打印原因；以操作者用户身份手动运行指出的程序，查看它自己的消息 |
| 面板显示 dsh-superagent 没有响应 | 它正在重启，或因配置问题没能启动；DeepSeek Harness 日志会指出原因 |
| `dsh-superagent configuration has keys it does not use`（日志） | 移除指出的 key；消息会说明每个值现在放在哪里 |
| 日志显示插件与正在运行的 dsh 不兼容 | 安装一个在 `engines.dsh` 范围内的 DeepSeek Harness 版本 |
| 升级 DeepSeek Harness 后面板显示 "Failed to load plugins" | 重启正在运行的实例 |
| @ 之后什么都没发生 | 检查作者是否在该 Source 的允许名单上、Source 是否开启、处理是否未被暂停。在 GitHub 上，通过编辑 Issue 正文添加的 @ 不会被接收；请在评论中 @ agent |
