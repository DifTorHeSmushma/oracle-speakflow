# PRD: Oracle SpeakFlow "Pro" Upgrade (Phase 3)

## 1. Vision & Strategic Objective
To transform Oracle SpeakFlow from a "Groq-wrapper utility" into a **professional, local-first, ecosystem-integrated voice-to-action platform** for AI developers. The goal is to achieve "Silicon Valley" quality (UI/UX) and "Enterprise" privacy (Local-first) with **zero budget**.

## 2. Target Audience
- **The Agentic Coder:** Developers using Cursor, Claude, or Windsurf who need to "think out loud" into their codebases.
- **Privacy Purists:** Users who refuse to send audio data to third-party APIs.
- **Flow-State Optimizers:** Users who want <500ms latency between "thought" and "text."

## 3. Key Pillars & Functional Requirements

### Pillar A: Local-First Intelligence (The "Privacy" Win)
- **[FR-01] Local Whisper Integration:** Bundle `whisper.cpp` or a high-performance WASM/Node binding.
- **[FR-02] Offline Mode:** The app must function fully without an internet connection.
- **[FR-03] Model Management:** Allow users to download/select different Whisper model sizes (tiny, base, small) based on their hardware.

### Pillar B: Ecosystem Integration (The "Workflow" Win)
- **[FR-04] MCP Server Implementation:** Expose a Model Context Protocol server.
    - `tool: get_last_transcript` — Returns the most recent transcription.
    - `resource: transcripts/history` — Provides a list of recent voice notes.
- **[FR-05] Cursor/Claude Synergy:** Allow SpeakFlow to act as a "Voice Context" provider for AI agents.

### Pillar C: Premium UI/UX (The "Silicon Valley" Look)
- **[FR-06] Design System:** Migrate to **Tailwind CSS v4** + **shadcn-svelte**.
- **[FR-07] Visual Feedback:** 
    - Real-time waveform visualization during recording.
    - Floating "HUD" (Heads-Up Display) that appears near the cursor during transcription.
- **[FR-08] Zero-Friction Install:** Bundle all dependencies (SoX replacement) into a single `.exe`/`.dmg`.

## 4. Non-Functional Requirements (The "Forensic" Constraints)
- **[NFR-01] Latency:** Perceived latency from "Key Up" to "Text Appear" must be < 800ms (Local) or < 1.5s (Cloud).
- **[NFR-02] Footprint:** Idle RAM usage < 100MB; Active Transcription < 500MB.
- **[NFR-03] Reliability:** 99.9% success rate for "Key-to-Paste" pipeline.
- **[NFR-04] Security:** API keys must remain in encrypted local storage or OS-level keychains (e.g., node-keytar).
  **Status: DEFERRED — Milestone 5.** See [ADR-0001](ADR-0001-nfr04-keychain-deferral.md) for threat model, compensating controls, and target milestone. Plaintext userData storage is accepted temporarily; `safeStorage` or `node-keytar` will be introduced at Milestone 5.

## 5. User Stories & Error Paths

### Happy Path: "The Voice Refactor"
1. User highlights a messy function in Cursor.
2. User presses `Ctrl+Alt+R` and says: "Refactor this to use the Result pattern and add JSDoc."
3. SpeakFlow transcribes locally, Cursor (via MCP) reads the transcript and performs the edit.

### Error Path: "The Hardware Failure"
1. User triggers recording but the microphone is disconnected.
2. **Requirement:** UI must show a "Device Not Found" toast immediately and reset the state machine to IDLE (Invariant #12).

## 6. Design Tokens (The "Pro" Aesthetic)
- **Primary Color:** `Zinc-950` (Background), `Zinc-100` (Text).
- **Accent Color:** `Indigo-500` (Active/Recording).
- **Typography:** `Geist Sans` or `Inter` (System-native feel).
- **Corner Radius:** `0.5rem` (Soft-modern).

## 7. Success Metrics
- **GitHub Stars:** Target 500+ within 3 months of "Pro" release.
- **User Retention:** 70% of users who install the MCP server use it daily.
- **Monetization:** First "Buy Me a Coffee" donation within 30 days of release.
