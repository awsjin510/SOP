# Archive — Firebase-era code

These files were part of the original Firebase + Auth + Firestore architecture
(W1–W10). They were moved out of `src/` during the MVP refactor (May 2026) so
that `vue-tsc` no longer compiles them. The files are kept verbatim for
reference / future revival.

## Why moved
- Project pivoted to a frontend-only MVP on GitHub Pages with BYOK Anthropic.
- Auth / Firestore / Storage / Functions are no longer used at runtime.

## Contents
- `pages/`        Login, Dashboard, multi-SOP and version-management pages
- `services/`    Firestore / Auth / Storage / Cloud Functions wrappers
- `stores/`       Pinia stores that subscribed to Firestore

## Restoring later
1. Move desired file back into `src/`
2. Re-implement its data layer against IndexedDB (or whatever new backend)
3. Re-add corresponding route entries to `src/router/index.ts`
4. Re-add Firebase deps to `package.json` if needed
