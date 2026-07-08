# Milestone 3 PRD: The Ecosystem Bridge (MCP)

## 1. Objective
To transform Oracle SpeakFlow from a standalone utility into a **context provider** for AI agents (Cursor, Claude Desktop, Windsurf). This milestone implements the Model Context Protocol (MCP) to allow AI agents to "read" the user's voice transcripts directly.

## 2. Target Workflows
- **Voice-to-Prompt:** User records a complex instruction via SpeakFlow, and the AI agent in Cursor retrieves it automatically to perform a refactor or explanation.
- **Contextual Memory:** The AI agent can look back at the last 10 voice transcripts to understand the user's recent focus.

## 3. Functional Requirements

### [FR-M3-01] MCP Tool: `get_last_transcript`
- **Description:** A tool that returns the text of the most recent successful transcription.
- **Input:** None.
- **Output:** A JSON object containing the `text`, `timestamp`, and `mode` (local/remote).

### [FR-M3-02] MCP Resource: `transcripts://history`
- **Description:** A resource that provides a list of the last 10 transcriptions.
- **Format:** A markdown-formatted list of transcripts with timestamps.

### [FR-M3-03] Headless Lifecycle Management
- **Requirement:** When launched with `--mcp`, the app must start the JSON-RPC server over `stdio` and remain active until the parent process (e.g., Cursor) closes the pipe.
- **Requirement:** The MCP server must be able to access the same `transcriptStore` used by the GUI process (if running).

### [FR-M3-04] Tool Call Notifications
- **Requirement:** (If GUI is active) Show a subtle visual indicator or toast when an external agent calls an MCP tool.

## 4. Technical Constraints (Forensic)
- **Protocol:** MCP JSON-RPC 2.0 over `stdio`.
- **Concurrency:** Handle cases where the user is recording a *new* transcript while an agent is requesting the *last* one.
- **Security:** Ensure the MCP server only exposes transcripts and not configuration data (API keys, etc.).

## 5. Success Metrics
- **Integration:** Successfully connected and verified via `mcp-inspector`.
  > **Note (2026-05-14):** `@modelcontextprotocol/inspector` starts a web-based proxy
  > server (`localhost:6277`) and does not support a headless/CLI verification mode.
  > Full GUI-based inspector verification is therefore not feasible in an automated
  > session. The **spawn-pipe gate** (`scripts/test-mcp-spawn.mjs`) is accepted as
  > equivalent evidence: it exercises the full stdio JSON-RPC lifecycle — `initialize`,
  > `tools/list`, `tools/call`, `resources/list`, `resources/read` — and verifies all
  > 5 responses. Gate result: **PASS 5/5**, process exits 0 (verified 2026-05-14).
  > This metric is marked **satisfied via equivalent evidence**.
- **Latency:** MCP tool response time < 100ms.
- **Reliability:** 100% success rate for transcript retrieval after a "Finalized" state.

## 6. User Story: "The Forensic Handoff"
1. User records: "Analyze the error handling in this file and suggest a fix."
2. User switches to Cursor and says: "Use SpeakFlow to get my last instruction and do it."
3. Cursor calls `get_last_transcript`, receives the text, and executes the task.
