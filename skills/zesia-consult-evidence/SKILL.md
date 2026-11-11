---
name: zesia-consult-evidence
description: Answer a specific 则灵 follow-up that requests observable local evidence, within existing permissions. Use when the consultant asks for code, logs, configuration, test output or a source passage.
---

# zesia-consult-evidence

Use only for `followUp.requests` whose `kind` is `evidence`, or a `clarification` whose answer is safely observable from the project (for example a deployed version, a configuration value or a test result). Keep the same local consultation via `consultId`; do not start a new unrelated consultation.

Call `zesia_context` with the `consultId` if the pending questions are missing. Read the exact question and `whyNeeded`. Gather only the missing code/callers, configuration, logs, test output or source passage. Preserve its provenance and limitations. Read-only inspection within existing permissions is appropriate; experiments, external actions and file access still require their ordinary authorization. If evidence is unavailable, report that fact rather than guess or rerun repeatedly.

Call `zesia_followup` with the parent `consultId` and answers keyed by `requestId`. Supply `text` and `sourceRef`; attach original excerpts with `evidenceFiles` where applicable. Send only new material to the tool: it retains the previously approved context and constructs the complete snapshot shown in the next confirmation. The stateless cloud cannot read local files or recover prior context from `contextId` alone.

Default confirmation applies on every round. Do not approve the draft yourself. At most three cloud rounds per local consultation, one draft per parent response. Never retry unknown effects. When the request asks for user preferences, goals, risk acceptance or permission, stop and use `zesia-consult-decision`. Do not infer a decision from technical evidence.
