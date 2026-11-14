---
name: zesia-consult-prepare
description: Prepare a scoped, source-linked 则灵 consultation packet for the current task and reply, then review in the shared zesia.dev/consult window. Use when the user asks for a second opinion, wants a reply reviewed, is dissatisfied with the current direction, or invokes /zesia.
---

# zesia-consult-prepare

Prepare the current decision for 则灵; do not hand off ownership of the user's task.

1. Identify the user's goal, the exact question and response to review, the current approach, failed attempts and the unresolved issue. Preserve explicit user constraints; keep your own inferences separate.
2. Build `context.statements`: stable id, `kind`, `origin`, `text`, `sourceRef` and `sourceQuote`. Copy user quotes exactly. Claude Code does not expose conversation message IDs to plugins, so use `conversation:user` as `sourceRef` and an exact quote; say `unavailable` when no real quote exists. Never fabricate a reference or a user requirement.
3. Select necessary original evidence. For engineering use `references/evidence.md`; other domains need the actual data definitions, units, methods or source passages relevant to this decision. Do not force Git fields onto non-code tasks. A local path or URL is only a locator: include the excerpt itself for the cloud. Preserve errors, numbers and code verbatim; label summaries as summaries. Use `evidenceFiles` for bounded local excerpts when available: it is a TOP-LEVEL argument alongside `brief` and `context`, never a field inside `context`. Never send credentials, unrelated files, the full chat history or hidden reasoning.
4. Call `zesia_consult` once with `project`, `brief`, `context` (and optional `evidenceFiles`). It prepares a local draft and opens the shared `https://zesia.dev/consult` online review window; nothing is sent until the user clicks approve in that browser window. Never paste the packet into chat or approve on the user's behalf.
5. Call `zesia_wait` with the returned `draftId` (default 120s, up to 900s) to retrieve the completed opinion. If it is still pending, use `zesia_result` or `zesia_wait` again for the same `draftId`; never prepare a duplicate draft for the same reply.
6. On a response, load `zesia-consult-evidence` for evidence requests, `zesia-consult-decision` for user choices or unclassified clarification, and `zesia-consult-adopt` for checking usable advice. A cloud question grants no new local execution permission.
7. If an executed tool returns `ok=false`, stop and report its error; do not repeatedly reshape or resubmit the request.
