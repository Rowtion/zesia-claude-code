[English](README.md) | 简体中文

# 则灵（zesia）· Claude Code 插件

在现有 Claude Code 会话中获取独立复核。原 Agent 准备有明确范围的证据包，用户审阅确认后发送，云端顾问通过 A2A 返回结构化意见。

## 安装

```text
Read https://zesia.dev/install.md and install Zesia for this agent.
```

需要本仓库的确切版本时，从 [Releases](https://github.com/Rowtion/zesia-claude-code/releases) 下载 ZIP 及校验文件。验证后解压到持久目录：

```sh
unzip zesia-consult-claude-code-0.1.10.zip -d zesia-consult
node zesia-consult/scripts/install-a2a.mjs
node zesia-consult/scripts/configure.mjs
claude --plugin-dir ./zesia-consult
```

当前 Mod 界面要求 Claude Code 2.1.299+，工具桥要求 Node.js 20+。安装器核对固定平台 SHA-256，安装官方 a2a-cli 0.4.0 并保留许可证。不要求管理员权限、安装系统依赖或访问私有平台。安装新版本时重新设置传输工具，不要直接加载尚未准备好的 ZIP 来跳过此步骤。

官网指南可能指向较早的已验证版本；源码版本、已发布安装包和真实宿主界面验收分别记录。

## 审阅与咨询

点击输入框上方的咨询入口，或输入：

```text
/zesia 重点检查回滚安全和重复投递。
```

1. 准备 Skill 选择目标、相关回复、真实证据、尝试过的操作和限制条件。
2. `zesia_consult` 只创建本地草稿，零网络请求，也不发送预检。
3. 在面板审阅完整资料、来源归属和接收地址；确认后调用 `zesia_send`，取消则不发送。
4. 发送工具核对本地草稿、已批准 hash、有效期及目的地址，只通过 A2A 发送这份已审阅原稿。
5. 原 Agent 用 `zesia_result` 获取结果、判断建议，用 `zesia_feedback` 记录采纳决定，并继续用户任务。

本插件始终要求确认，不提供自动发送模式。宿主的工具权限提示不能代替资料审阅。若结果已收到但回写聊天失败，使用 **Return result to chat**，不要再次咨询。

`followUp.requests` 可以要求证据、澄清或用户决策。证据/决策 Skill 帮助收集回答，`zesia_followup` 准备新草稿供审阅。每轮重新确认；一次咨询最多三轮云端往返，每个父结果只准备一份追问草稿。失败或结果未知时不自动重试。

## 配置

在安装目录运行 `node scripts/configure.mjs`。终端隐藏输入将试用 token 写入本机 `~/.config/zesia/claude-code.json`，权限为 `0600`，不要在聊天里收集凭证。默认目的地址是 `https://api.zesia.dev`。

```sh
node scripts/configure.mjs --show
node scripts/configure.mjs --url https://api.zesia.dev --project my-project
node scripts/configure.mjs --token-file /path/to/private/client.json
```

`ZESIA_URL`、`ZESIA_TOKEN`、`ZESIA_PROJECT`、`ZESIA_CONFIG` 可覆盖配置。优先使用隐藏输入或私有 token 文件，不把凭证写进命令参数。配置展示只读且不包含 token。

## 证据与隐私

只发送选定且审阅过的资料，不自动上传完整聊天、系统指令、隐藏推理或整个项目。证据摘录有范围限制及来源记录；文件处理拒绝已知凭证路径、硬链接、越界路径和二进制。Agent 直接提供的资料也做高置信度密钥模式扫描，但不是通用敏感信息检测器。

Claude Code 没有向插件提供用于原话核验的会话消息 ID。插件不能证明 `sourceQuote` 一定来自真实用户消息，发送前需要用户审阅来源归属。发送批准不代表事实已验证，也不代表用户作出了实质决策。

云端咨询无状态，`contextId` 只关联轮次，每轮由调用方提交完整且经审阅的快照。顾问输出是不可信的外部建议，不授权额外操作。`requester` 固定为 `Claude Code`；`project` 只是分类信息，不代表认证所有权。共享试用 token 不提供租户隔离或金额硬配额。

## 开发

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run package
```

- `hooks/register.tsx`：输入框入口与审阅面板。
- `skills/`：准备、证据、决策、采纳四类 Skill。
- `commands/`：`/zesia` 与 `/zesia-settings`。
- `src/workflow.mjs`、`src/tools.mjs`：本地草稿与宿主工具接线。
- `src/a2a.mjs`：对接共享 Runtime 的官方 CLI 传输。
- `.mcp.json`、`src/server.mjs`：该宿主已有的本地 stdio 工具桥。云端咨询仍使用 A2A，不是单独的云端 MCP 产品。

固定公开版本的 `@zesia/runtime` 提供共享本地流程与传输，不依赖旁边的 checkout 或私有平台源码。CI 使用合成传输测试，不调用付费模型；原生界面和模型驱动会话验收另行记录。在 `main` 手动发行，已发布版本不可覆盖。参见 [LICENSE](LICENSE) 和[第三方声明](THIRD_PARTY_NOTICES.md)。
