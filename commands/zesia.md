---
description: Ask 则灵 for an independent review of the current reply or plan.
argument-hint: [focus or question]
---

Load the `zesia-consult-prepare` skill and ask 则灵 for an independent review of the current assistant reply.

Focus, if the user supplied it: $ARGUMENTS

Follow the skill exactly:

1. Identify the user's actual goal, the reply under review, the current approach, failed attempts and unresolved issues. Preserve explicit user constraints; keep your own inferences separate.
2. Build `context.statements` with stable ids, `kind`, `origin`, `text`, `sourceRef` and an exact `sourceQuote` for user statements. Use `conversation:user` plus the exact quote when no message ID is available. Never fabricate a quote or a user requirement.
3. Include only the evidence needed for this decision. Prefer `evidenceFiles` for bounded project excerpts. Never send credentials, hidden reasoning, the full transcript or unrelated files.
4. Call `zesia_consult` once. It prepares a local draft and opens the shared `https://zesia.dev/consult` online review window: nothing is sent until the user approves in that window.
5. Briefly mention the opened `https://zesia.dev/consult` window (or share its URL if automatic opening failed) without pasting the packet into chat. Never approve on the user's behalf.
6. Call `zesia_wait` (or `zesia_result`) with `draftId` to retrieve the completed opinion. Do not prepare a duplicate draft if the wait times out; call `zesia_result` or `zesia_wait` again.
7. When advice arrives, load `zesia-consult-adopt`, assess it, and record the local decision with `zesia_feedback`.

If the user has not configured a token, tell them to run `node scripts/configure.mjs` in the plugin directory. Do not ask them to paste the token into the conversation.
