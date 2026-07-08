# Contributing to Oracle SpeakFlow

Thanks for wanting to contribute. This document explains how.

## Code of conduct

Be respectful. That is it.

## Before you start

1. Read **CLAUDE.md** � architectural invariants and code style.
2. Read **docs/DESIGN/** as needed for the area you are changing.
3. Run **npm test** � it must pass before you submit a PR.
4. Run **npm run typecheck** � zero TypeScript errors.

## dist/ and build output hygiene

The **`dist/`** tree is produced by **`npm run build`** (`tsc` only). Do not drop scratch files, `node -e` dumps, or patched copies into **`dist/`**. Use **`scripts/`**, a temp directory, or **`tmp/`** (gitignored). Full rationale and rules live in **CLAUDE.md** under **## dist/ Hygiene**.

## How to contribute

### Reporting bugs

Open an issue with:

- **Title:** brief description
- **Steps to reproduce:** exact steps
- **Expected vs actual behavior**
- **Environment:** Windows version, Node.js version, and whether **FFmpeg** is on PATH or bundled under **`resources/bin/`** (see README)

### Proposing features

Open an issue with use case, proposed approach, and alternatives. For large work, discuss before coding.

### Submitting code

1. Fork the repo and clone your fork.
2. Create a branch: `fix/...` or `feature/...`.
3. Make changes following **CLAUDE.md** (especially **`Result<T, E>`** at service boundaries).
4. Run validation:

   ```bash
   npm run typecheck
   npm test
   ```

   If you changed the tray UI, also run **`npm run test:ui`** when relevant.

5. Commit with clear messages (e.g. conventional prefixes: `feat:`, `fix:`, `chore:`).
6. Open a PR describing what changed, how to test it, and any new dependencies.

## Code review

We will check changes against **CLAUDE.md**, run tests, and may request revisions before merge.

## Development guidelines

### TypeScript

- Strict mode; no `any` at boundaries without a documented escape hatch.
- Prefer discriminated unions for errors.

### Error handling

Service-layer functions that can fail return **`Result<T, E>`** � see **CLAUDE.md** and existing **`src/services/`** code.

### Testing

Cover happy paths, error paths, and edge cases. Mock at service boundaries; see existing **Vitest** tests under **`tests/`** and **`src-ui/__tests__/`**.

## Questions?

Open an issue or a discussion. Thanks for contributing.
