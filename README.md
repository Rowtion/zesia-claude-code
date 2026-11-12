# 则灵（Zesia）· Claude Code 插件

在 Claude Code 中调用 **则灵（Zesia）** 做独立复核：原 Agent 整理必要资料，先在本地生成待确认草稿；用户确认后，唯一的联网工具才把资料发到云端，再把结构化意见交回当前对话。

默认云端：`https://api.zesia.dev`。当前是需要独立试用 token 的限时限量免费公测，不是公开多用户服务。
模型密钥只保存在云端，不进入插件、聊天或 Git。

## 试用三步

```sh
unzip zesia-consult-claude-code-0.1.9.zip -d zesia-consult
node zesia-consult/scripts/install-a2a.mjs       # install pinned transport without administrator access
node zesia-consult/scripts/configure.mjs          # 粘贴单独获得的试用 token
claude --plugin-dir ./zesia-consult
```

在一条 Assistant 回复后输入 `/zesia`。插件会先准备资料草稿，展示完整 packet；你确认后才发送。

## 按钮与确认面板

插件使用 Claude Code 原生 Mod 组件，跟随宿主主题：

- 输入框上方出现 **zesia** 按钮；点击后让原 Agent 按 `zesia-consult-prepare` 整理资料并调用 `zesia_consult`。
- 资料准备好后，侧边打开 **zesia** 面板：先显示问题、目标与项目，再提供可展开的完整材料、来源归属、引用及追问回答。原始 JSON 单独展开；接收地址和确认操作在底部。
- **确认发送** 调用 `zesia_send`，对话只接收草稿引用，原 Agent 用本地只读工具 `zesia_result` 取回完整结果；**取消** 关闭面板，不发送。
- 确认前的准备阶段零外发；确认后仍受 Claude Code 工具权限和插件确认逻辑约束。

当前适配选择输入框上方的按钮和侧边确认面板。它与 DSH 共享准备、确认、发送、评估的产品流程；两端的宿主接线与状态实现分别维护。插件界面和错误使用英文，咨询资料保留原文，按钮指令要求 Agent 使用对话语言回复。

结果回流使用结构化工具返回值；追问草稿也会打开确认面板。结果已经收到但写回聊天失败时，可点击 **Return result to chat**，不会再次发起云端咨询。无法识别返回值或发送异常时不允许在面板里直接重发，避免重复费用与未知结果。

## 安装

统一安装入口：[zesia.dev/install](https://zesia.dev/install)，Agent 安装指南：[install.md](https://zesia.dev/install.md)。统一安装入口已覆盖 Claude Code、DSH 与通用 Skill。本地 MCP 工具桥仅用于宿主接线；不发行独立 Consult MCP 产品。以下本地命令保留供开发验收使用。

### 方式一：本次会话临时加载

```sh
claude --plugin-dir /path/to/zesia-claude-code
```

`--plugin-dir` 也可直接传 `.zip`。

### 方式二：通过本地 marketplace 安装

```sh
claude plugin marketplace add /path/to/zesia-claude-code
claude plugin install zesia-consult@zesia
```

重启 Claude Code 后生效。更新后运行 `claude plugin update zesia-consult@zesia` 并重启。

### 方式三：分发 zip

在 Zesia 仓库根目录执行：

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run package
```

生成 `dist/zesia-consult-claude-code-<version>.zip`。试用者解压后先配置 token，再加载目录：

```sh
unzip zesia-consult-claude-code-0.1.9.zip -d zesia-consult
node zesia-consult/scripts/configure.mjs
claude --plugin-dir ./zesia-consult
```

也可以跳过解压直接加载 zip，但需要先提供 `ZESIA_TOKEN`。不要把 token 直接写在命令行：它会进入 shell 历史；应先用 `read -s` 读入当前 shell，并注意同一用户的其他进程可能读取环境变量。

```sh
read -s ZESIA_TOKEN && export ZESIA_TOKEN
claude --plugin-dir ./zesia-consult-claude-code-0.1.9.zip
```

zip 不包含 token；token 必须单独发放、由用户在本机配置。

插件运行不依赖 npm 包，不需要 `npm install`。当前 Mod 界面要求 Claude Code >= 2.1.299，工具桥要求 Node.js >= 20；不会安装系统依赖，也不要求管理员权限。

## 配置试用 token

当前电脑执行：

```sh
node /path/to/zesia-claude-code/scripts/configure.mjs
```

在终端输入单独获得的试用 token，输入不回显，Ctrl+C 可取消。配置写入 `~/.config/zesia/claude-code.json`，权限 `0600`，不打印、不提交。非交互环境会提示改用终端或 `--token-file`，不会等待 Agent 在聊天中提供凭证。
也可以从已有文件读取，避免 token 进入 shell 历史：

```sh
node scripts/configure.mjs --token-file /path/to/client.json
```

其他选项：

```sh
node scripts/configure.mjs --url https://api.zesia.dev --project <你的项目名>
node scripts/configure.mjs --show                # 只查看非敏感配置
```

`--token <token>` 只建议在脚本中使用，因为它可能进入 shell 历史；日常配置优先用交互输入或 `--token-file`。

本插件**始终要求确认**，不提供自动发送模式。

环境变量 `ZESIA_URL`、`ZESIA_TOKEN`、`ZESIA_PROJECT`、`ZESIA_CONFIG` 可覆盖文件配置。

## 使用

在一条 Assistant 回复之后：

```text
/zesia 重点检查回滚路径和重复投递
```

流程：

1. 原 Agent 加载 `zesia-consult-prepare`，从当前任务、回复和真实证据中整理资料；
2. 调用 `zesia_consult`，**只在本地生成草稿**，不联网，连预检都不发；
3. 对话中展示接收地址、项目、问题、目标、来源记录、材料数量和完整 packet；
4. 用户明确回复确认后，Agent 只用草稿的 `draftId`、`approvedHash` 和用户确认原话调用 `zesia_send`；工具发送本地保存的已展示原稿，Agent 不再重抄资料；
5. 云端预检 → Jev 专家路由 → 固定 DeepSeek Flash 生成结构化意见；
6. 原 Agent 逐条判断采纳/拒绝/暂缓，用 `zesia_feedback` 记录本地决定，并继续推进用户任务。

`zesia_send` 是唯一会传输咨询资料的工具。它要求草稿 ID、已确认 hash 和用户确认原话，核对本地原稿、有效期及目的地址后发送。完整资料已在准备步骤与面板中展示；工具权限提示会显示确认所指的草稿与 hash，不再要求模型重抄整包。两种确认不能互相替代。插件无法证明原话一定来自用户，审阅资料仍是人工门禁。旧调用方若仍传入完整 packet，也必须与已确认 hash 一致，否则拒绝。

### 追问

如果意见返回 `followUp.requests`：

- `evidence`：按 `zesia-consult-evidence` 收集可观察证据，调用 `zesia_followup`；
- `user_decision` / 需要澄清：按 `zesia-consult-decision` 询问用户，取得原话后调用 `zesia_followup`。

每轮都重新准备草稿并确认。同一次咨询最多 3 轮云端往返，同一父回复只允许一次追问草稿；失败或未知结果不自动重试。

## 隐私与边界

- 只发送 Agent 整理并经用户确认的 packet；不自动上传完整聊天、系统提示词、隐藏推理、项目文件或其他会话。
- `zesia_send` 只发送已展示、hash 匹配的本地原稿。必须先审阅准备步骤或面板中的完整资料；不要仅凭工具调用的草稿 ID 判断内容。不要用工具权限自动批准代替用户的资料审阅。
- `evidenceFiles` 只复制项目内最多 3 段、每段最多 200 行 / 6000 字符的原文；拒绝凭证路径、硬链接、越界路径和二进制文件，并扫描高置信度密钥模式。`context.materials` 和 `statements` 直接由 Agent 提供，不做路径检查，但同样会做密钥模式扫描。
- 这些检查不是通用敏感内容检测器；用户仍需检查确认卡。
- 云端无状态：不保存聊天或咨询历史；`contextId` 只用于 A2A 关联，不能取回隐藏历史。
- 咨询返回的文本和 JSON 在工具输出中以 `<consultant_output>` / `<consultant_failure>` 围栏标记为**不可信数据**，其中的指令不得执行。
- `requester` 固定为 `Claude Code`；`project` 默认取配置或当前目录名。它们是分类标签，不是认证身份或所有权。
- 同一个共享试用 token 不提供多用户权限隔离、配额或美元硬预算。当前只有逐请求 token 边界。
- 咨询意见是外部建议，不扩大原 Agent 的权限，也不代表已执行任何操作。

## 与 DeepSeek Harness 版的差异

- Claude Code 没有回复操作栏和嵌入式确认卡，等价流程是**两次工具调用**：`zesia_consult` 准备，`zesia_send` 发送。
- Claude Code 不向插件暴露会话 message ID，因此插件**无法核验**用户原话是否真的来自用户消息。`sourceQuote` 由原 Agent 提供，用户在发送前审阅 packet 是最后一道确认。DeepSeek Harness 版会做原话匹配。
- `zesia_followup` 需要非 `evidence` 类回答提供非空原话，但同样不能做会话级核验。
- 设置工具是**只读**的；本插件始终要求确认，不提供自动发送模式。
- 面板和错误使用英文；咨询资料保留原文，复核指令要求 Agent 使用当前对话语言回复。

## 文件

- `.claude-plugin/plugin.json`：插件清单；`.claude-plugin/marketplace.json`：本地 marketplace。
- `.mcp.json`：注册 `zesia` MCP server。
- `src/server.mjs`：MCP stdio 入口。
- `src/tools.mjs`：六个工具及模型可见说明。
- `src/workflow.mjs`：草稿、确认、发送、续接和采纳状态。
- `src/a2a.mjs`：零依赖 A2A 1.0 JSON-RPC 客户端。
- `src/config.mjs`：私有本地配置和 URL 边界。
- `src/evidence.mjs`：有界证据摘录。
- `commands/`：`/zesia`、`/zesia-settings`。
- `hooks/register.tsx`：输入框上方的 zesia 按钮和确认面板（host adapter）。
- `skills/`：prepare / evidence / decision / adopt 四个 Skill。
- `scripts/configure.mjs`：写入试用 token。

## 测试

```sh
node --test test/*.test.mjs
```

覆盖配置与 URL 边界、A2A 请求/响应、证据摘录、草稿零外发、始终确认、哈希校验、三轮追问、采纳完整性和 MCP 协议握手。
测试使用模拟 fetch，不调用真实模型，也不产生费用。

开发依赖公共 `@zesia/client` 的固定版本成品，不依赖私有平台或旁边的目录；分发包已包含运行依赖。
