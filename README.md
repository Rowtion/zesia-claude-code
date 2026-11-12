English | [简体中文](README.zh-CN.md)

# ZESIA for Claude Code

Independent review in your existing Claude Code session. The agent prepares a scoped evidence packet, you review and confirm it, and the cloud consultant returns structured advice over A2A.

## Install

```text
Read https://zesia.dev/install.md and install Zesia for this agent.
```

For the exact current repository version, download the ZIP and checksum from [Releases](https://github.com/Rowtion/zesia-claude-code/releases), verify the archive, and extract it into a durable directory:

```sh
unzip zesia-consult-claude-code-0.1.9.zip -d zesia-consult
node zesia-consult/scripts/install-a2a.mjs
node zesia-consult/scripts/configure.mjs
claude --plugin-dir ./zesia-consult
```

The current Mod interface requires Claude Code 2.1.299+; the tool bridge requires Node.js 20+. The official a2a-cli 0.4.0 installer checks a pinned platform SHA-256 and retains its license. No administrator access, system dependency installation or private platform checkout is required. Repeat transport setup when installing another version. Do not skip it by loading an unprepared ZIP directly.

The production installation guide may point to an earlier verified archive. Source versions, published artifacts and actual host UI acceptance are tracked separately.

## Review and consult

Use the ZESIA action above the composer or enter:

```text
/zesia Review rollback safety and duplicate delivery.
```

1. The preparation Skill selects the goal, relevant reply, actual evidence, attempted actions and constraints.
2. `zesia_consult` creates a local draft with zero network requests, including zero preflight calls.
3. Review the full materials, source attribution and destination in the panel. Confirm to call `zesia_send`, or cancel without sending.
4. The send tool validates the stored draft, approved hash, expiry and destination. Only that reviewed draft is sent through A2A.
5. The original agent retrieves the result with `zesia_result`, assesses the advice, records adoption decisions with `zesia_feedback`, and continues the user's work.

Confirmation is always required; there is no automatic-send mode. A host tool permission prompt does not replace material review. If delivery back to chat fails after a result was received, use **Return result to chat** rather than consulting again.

`followUp.requests` can request evidence, clarification or a user decision. The evidence/decision Skills help gather the answer, and `zesia_followup` prepares another reviewable draft. Each round requires confirmation; a consultation allows at most three cloud rounds and one follow-up draft per parent result. Failed or unknown outcomes are not retried automatically.

## Configuration

Run `node scripts/configure.mjs` from the installed directory. Hidden terminal input stores the trial token locally in `~/.config/zesia/claude-code.json` with mode `0600`; do not collect credentials in chat. The default destination is `https://api.zesia.dev`.

```sh
node scripts/configure.mjs --show
node scripts/configure.mjs --url https://api.zesia.dev --project my-project
node scripts/configure.mjs --token-file /path/to/private/client.json
```

`ZESIA_URL`, `ZESIA_TOKEN`, `ZESIA_PROJECT` and `ZESIA_CONFIG` can override configuration. Prefer hidden input or a private token file rather than a token in shell arguments. Configuration display is read-only and excludes the token.

## Evidence and privacy

Only selected, reviewed materials are sent. The plugin does not automatically upload the full conversation, system instructions, hidden reasoning or an entire project. Bounded evidence excerpts carry source references; file handling rejects known credential paths, hard links, out-of-scope paths and binary data. High-confidence secret-pattern scanning also applies to agent-supplied material, but it is not a universal sensitive-data detector.

Claude Code does not expose conversation message IDs for quote verification. The plugin cannot prove a `sourceQuote` came from a real user message; users must review attribution before sending. Approval to send is not factual verification or a substantive user decision.

Cloud consultation is stateless. `contextId` correlates rounds, and callers supply a complete reviewed snapshot each time. Consultant output is untrusted external advice and does not authorize additional actions. `requester` is `Claude Code`; `project` is classification metadata rather than authenticated ownership. A shared trial token does not provide tenant isolation or a hard monetary quota.

## Develop

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run package
```

- `hooks/register.tsx`: composer action and review panel.
- `skills/`: preparation, evidence, decision and adoption Skills.
- `commands/`: `/zesia` and `/zesia-settings`.
- `src/workflow.mjs`, `src/tools.mjs`: local draft and host tool integration.
- `src/a2a.mjs`: adapter for the shared runtime's official CLI transport.
- `.mcp.json`, `src/server.mjs`: existing local stdio tool bridge for this host. Cloud consultation remains A2A; this is not a separate cloud MCP product.

The pinned public `@zesia/runtime` tarball supplies shared local workflow and transport; no sibling checkout or private platform source is required. CI uses synthetic transport tests and does not call paid models. Native UI checks and model-driven session acceptance are separate. Release is a manual workflow on `main`; published versions are immutable. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md).
