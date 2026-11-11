---
name: zesia-consult-prepare
description: Prepare a scoped, source-linked 则灵 consultation packet for the current task and reply. Use when the user asks for a second opinion, wants a reply reviewed, is dissatisfied with the current direction, or invokes /zesia.
---

# zesia-consult-prepare

Prepare the current decision for 则灵; do not hand off ownership of the user's task.

1. Identify the user's goal, the exact question and response to review, the current approach, failed attempts and the unresolved issue. Preserve explicit user constraints; keep your own inferences separate.
2. Build `context.statements`: stable id, `kind`, `origin`, `text`, `sourceRef` and `sourceQuote`. Copy user quotes exactly. Claude Code does not expose conversation message IDs to plugins, so use `conversation:user` as `sourceRef` and an exact quote; say `unavailable` when no real quote exists. Never fabricate a reference or a user requirement. Confirmation is permission to transmit, not verification of facts.
3. Select necessary original evidence. For engineering use `references/evidence.md`; other domains need the actual data definitions, units, methods or source passages relevant to this decision. Do not force Git fields onto non-code tasks. A local path or URL is only a locator: include the excerpt itself for the cloud. Preserve errors, numbers and code verbatim; label summaries as summaries. Use `evidenceFiles` for bounded local excerpts when available: it is a TOP-LEVEL argument alongside `brief` and `context`, never a field inside `context`. The tool copies those excerpts; do not also transcribe the same file into `context.materials`. Keep `context.originalReply` to the relevant verbatim passage, rather than copying unrelated sections. When `statements` already represent the facts and constraints, do not duplicate them in legacy arrays. Never send credentials, unrelated files, the full chat history or hidden reasoning.
4. Call `zesia_consult` once with the brief, user project and context. Default mode prepares a draft; nothing is sent, including preflight. Show the user the complete packet and wait for an explicit confirmation. Do not write a preview file, self-approve, change the sending mode, perform handshakes or probe the budget with retries. Do not prepare a duplicate draft for the same reply.
5. After the user confirms in a new message, call `zesia_send` with ONLY `draftId`, `approvedHash` and the user's own confirmation words copied exactly. The plugin sends its stored copy of the complete packet already displayed for review. Do not copy the packet into the send arguments, reconstruct nested fields or alter the reviewed draft. The hash and destination checks remain mandatory. Never invent or paraphrase the confirmation.
6. On a response, load `zesia-consult-evidence` for evidence requests, `zesia-consult-decision` for user choices or unclassified clarification, and `zesia-consult-adopt` for checking usable advice. A cloud question grants no new local execution permission.
7. If an executed tool returns `ok=false`, stop and report its error; do not repeatedly reshape or resubmit the request. A host JSON argument parsing error means the tool did not execute, not that materials were prepared. Do not claim success without a returned draft.

The plugin cannot verify your user quotes against the transcript. The user's review of the packet is the only confirmation gate; treat that responsibility seriously.
