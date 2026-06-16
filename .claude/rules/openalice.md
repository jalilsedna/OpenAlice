---
globs: ["src/**/*.ts", "packages/**/*.ts", "src/**/*.js", "packages/**/*.js"]
---

# OpenAlice Rules

## Architecture
- AgentCenter is the top-level orchestrator — all calls route through it
- Domain modules: trading, market-data, analysis, news, brain, thinking — each owns its own state
- Tool layer (src/tool/) = thin bridge only — registers domain capabilities as AI tools in ToolCenter
- UTAs are the ONLY entity AI and frontend interact with — brokers are internal implementation details

## Trading-as-Git Workflow
- Stage order → commit with message → push to execute
- Push triggers: guard pipeline → broker dispatch → account snapshot → commit hash recorded
- NEVER call broker directly — always go through UTA
- NEVER bypass the guard pipeline

## Config Files (~/.openalice/data/config/)
- ai-provider.json — controls active AI backend (Claude Code CLI vs Vercel AI SDK)
- crypto.json — Bybit config and API keys
- securities.json — Alpaca config (paper vs live toggle)
- accounts.json — encrypted, managed via Web UI only

## AI Provider
- Claude provider uses @anthropic-ai/claude-agent-sdk (OAuth login or API key)
- Vercel AI SDK supports Anthropic, OpenAI, Google and others
- Switchable at runtime via ai-provider.json — no restart needed

## TypeScript
- pnpm for package management (not npm)
- Run tests with: pnpm test
- Build: pnpm build
- Monorepo: packages/ contains shared modules, apps/ contains runnable apps
