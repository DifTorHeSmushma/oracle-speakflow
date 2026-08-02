# Security Policy

## Supported versions

Security fixes are applied to the latest `main` branch and the most recent tagged release when tags exist.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security-sensitive reports.

1. Use GitHub **Security → Advisories → Report a vulnerability** on this repository, or
2. Email the maintainer listed in `package.json` (`build.linux.maintainer`) with the subject `SpeakFlow security`.

Include:

- Description of the issue and impact
- Steps to reproduce (or a proof-of-concept)
- Affected platform (Windows / macOS / Linux) and whether you used a packaged build or `npm` from source

You should receive an acknowledgement within **7 days**. We will coordinate disclosure after a fix or mitigation is available.

## Secrets and API keys

- Never commit `.env`, API keys, or transcription logs.
- Groq (and other) API keys belong only in local user data (e.g. `%APPDATA%\oracle-speakflow\.env` on Windows).
- Packaged CI artifacts are hygiene-checked so `.env` files are not shipped inside installers.
