---
description: Show 则灵's local destination and confirmation mode.
argument-hint: (no arguments)
allowed-tools: mcp__zesia__zesia_settings
---

Call `zesia_settings` with no arguments and report the destination and current confirmation mode.

This plugin always requires confirmation; automatic sending is not supported, and a stored `confirmBeforeSend: false` from an older config is ignored. The settings tool is read-only, so a model call or prompt injection cannot change this behavior.

This command sends no consultation and changes no token.
