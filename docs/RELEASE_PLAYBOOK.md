# OSF public installer Release — locked playbook

**Project:** Oracle SpeakFlow only  
**Goal:** Non-technical users click **Releases** → download Windows / Mac / Linux installers.  
**Out of scope (do not add):** Apple notarization, auto-update, new features, README redesign, other repos, reliability refactors.

## Deterministic steps (in order)

1. **Clean tree on `main`** at the commit to ship (no local WIP in the release).  
2. **Write/confirm this playbook** (no extra docs).  
3. **Tag** `vX.Y.Z` matching `package.json` version (first public: `v0.1.0`).  
4. **Push tag** → GitHub auto-runs `mac-package.yml` + `linux-package.yml`.  
5. **Build Windows** locally: `npm run package` → `dist-installer/Oracle SpeakFlow Setup *.exe`  
   - Require **≥5 GB free** on C: before packaging.  
6. **Wait** for Mac + Linux Actions to succeed.  
7. **Download CI artifacts** into `dist-installer/release-assets/`:  
   - `oracle-speakflow-mac-dmg` / `oracle-speakflow-mac-zip`  
   - `oracle-speakflow-linux-deb` / `oracle-speakflow-linux-appimage` (AppImage optional if missing)  
8. **Create GitHub Release** for the same tag; attach:  
   - Windows Setup `.exe`  
   - Mac `.dmg` + `.zip`  
   - Linux `.deb` (+ `.AppImage` if present)  
9. **Smoke check:** open repo → Releases → all three platforms listed with files.  
10. **Stop.** No further changes unless Dom asks.

## Done means

- https://github.com/DifTorHeSmushma/oracle-speakflow/releases shows the tag  
- Each OS has at least one downloadable installer asset  
- Source on `main` matches that tag

## Notes

- CI artifacts expire; **Release assets do not** — always publish to Releases.  
- Mac is ad-hoc signed (Gatekeeper may require right-click → Open).  
- Linux desktop dictation smoke (G32) is separate from “installer downloadable.”
