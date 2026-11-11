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
4. Call `zesia_consult` once. It only prepares a local draft: nothing is sent, not even preflight.
5. Show the user the destination, project, brief, goal, statement/material counts and the complete packet. Ask for an explicit confirmation.
6. Only after a new user message explicitly confirms sending, call `zesia_send` with `draftId`, `approvedHash` and the user's own confirmation words copied exactly. Omit `packet`: the tool sends the complete reviewed draft it already stores locally. Never reconstruct or edit the packet after review, never send on the user's behalf, never invent or paraphrase the confirmation, and never claim advice arrived before `zesia_send` returns.
7. When advice arrives, load `zesia-consult-adopt`, assess it, and record the local decision with `zesia_feedback`.

If the user has not configured a token, tell them to run `node scripts/configure.mjs` in the plugin directory. Do not ask them to paste the token into the conversation.
