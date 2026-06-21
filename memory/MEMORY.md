---
name: OpenAlice Session Memory
description: Cross-session notes — learned patterns, config quirks, current focus
type: project
---

# Session Memory

## Current Focus

**IBKR/UTA reject-reason surfacing** (branch `claude/happy-cori-eno5ux`,
4 commits ahead of master). Make venue order rejections non-silent: lift
`rejectReason`/`warningText` from IBKR TWS callbacks → `OperationResult.error`
→ every Alice-facing surface. Observability only, no order-flow change.
Tests green (1946); **live IBKR demo re-verify still pending**, not yet
PR'd to master. Full sync note: `memory/handoff-2026-06-21.md`.

## Learned Patterns
- All config lives in ~/.openalice/data/config/ as JSON files — edit via Web UI except accounts.json
- accounts.json is encrypted — never edit directly, always use Web UI
- Trading-as-Git: stage order, commit with message, push to execute — never call broker directly
- Guard pipeline runs before every push — never bypass it
- Switch AI provider by editing ai-provider.json — takes effect without restart
- UTAs are independent — one per broker (e.g. Alpaca for equities, Bybit for crypto)

## Config Quirks

## Unresolved Questions
