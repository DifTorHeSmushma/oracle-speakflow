---
description: Load agent tool-building patterns before creating or modifying tools
---

# Prime for Tool Development

Load tool development patterns to prepare for building or modifying agent-facing tools in this repo (MCP tools, Electron `electronAPI` surface, or similar).

## Context

**Use this command when:**
- Adding or changing MCP tool definitions (`--mcp` mode in `src/electron-main.ts`)
- Changing the renderer `window.electronAPI` / preload surface
- Reviewing tool quality before a code review

## Read

- `CLAUDE.md` — MCP stdout reserved for JSON-RPC; API key masking; IPC invariants
- `src/types/ipc.ts` — shared IPC payload types
- `src/preload.cts` — CJS preload / contextBridge pattern
- Existing MCP handlers in `src/electron-main.ts` (`runMcpServer`)

## Process

Understand and internalize:

1. **Core Philosophy** — Tool docstrings/descriptions guide LLM tool selection, not just human docs
2. **Required elements** — One-line summary, "Use this when", "Do NOT use", Args with guidance, Returns, Performance notes, Examples
3. **Agent Perspective** — Write for correct tool selection; negative guidance prevents wrong calls
4. **SpeakFlow constraints** — Never log raw API keys; MCP mode must not write to `stdout` except JSON-RPC; preload stays CJS (`.cts`)
5. **Anti-patterns** — Vague affirmative guidance, missing "Do NOT use", toy examples (`foo.md`), exposing secrets in tool output

## Report Back

### Key Principles (5 bullets max)
- [Summarize the core principles you internalized]

### Critical Distinctions
- [What makes agent tool descriptions different from ordinary API docs?]
- [Why does "Do NOT use" matter for tool selection?]

### Ready to Apply
- [One sentence confirming you're ready to write agent-optimized tool surfaces for SpeakFlow]
