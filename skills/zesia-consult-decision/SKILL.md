---
name: zesia-consult-decision
description: Clarify user-owned choices raised by 则灵 without deciding or authorizing actions on the user's behalf. Use for user_decision requests, or clarification whose answer is not safely observable.
---

# zesia-consult-decision

Use for follow-up kind `user_decision`, or a `clarification` whose answer is not safely observable from the project and therefore belongs to the user.

Call `zesia_context` with `consultId` to get the current requests and round limit before asking about the decision. If `followUpState.stopped` is true, record the question as unanswered and continue the user’s task with the saved advice.

Explain the decision in the user's language: what is being chosen, why it affects the recommendation, the grounded alternatives and their consequences. A reasoned recommendation is allowed; choosing for the user is not. Do not ask again if their answer is already explicitly available. Do not invent options or budget numbers.

Wait for an explicit answer when a choice is necessary. Supply its exact quote and a real source reference in `zesia_followup` as `sourceQuote` and `sourceRef` for the matching `requestId`. Claude Code does not expose conversation message IDs to plugins, so the plugin requires a non-empty quote but cannot verify it against the transcript; do not present that as verification. An assistant statement, tool result, draft confirmation or permission to send is not the user's decision. If no verifiable quote exists, explain the limitation instead of fabricating one.

Separate permission to submit advice from permission to perform the recommended action. Preserve unanswered questions as unknown. A third-round response must end with bounded advice and unresolved limits, not an unlimited dialogue.
