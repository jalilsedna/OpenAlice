---
name: OpenAlice Session Memory
description: Cross-session notes — learned patterns, config quirks, current focus
type: project
---

# Session Memory

## Current Focus

## Learned Patterns
- All config lives in ~/.openalice/data/config/ as JSON files — edit via Web UI except accounts.json
- accounts.json is encrypted — never edit directly, always use Web UI
- Trading-as-Git: stage order, commit with message, push to execute — never call broker directly
- Guard pipeline runs before every push — never bypass it
- Switch AI provider by editing ai-provider.json — takes effect without restart
- UTAs are independent — one per broker (e.g. Alpaca for equities, Bybit for crypto)

## Config Quirks

## Unresolved Questions
