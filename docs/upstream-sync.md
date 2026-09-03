# Sustainable upstream synchronization

This repository is a long-lived fork of [`mikjee/warpdrv`](https://github.com/mikjee/warpdrv). The
fork keeps upstream features current while retaining its own product surface: English/Chinese
localization, ModelScope integration, hardened local-server and WarpMCP boundaries, expanded
llama.cpp launch controls, Windows lifecycle handling, and Windows MSI delivery.

The one-time divergence recovery was completed from upstream `v0.6.17` (`25e0e823`) by making the
upstream tip the first parent and the former fork tip (`799a664`) the second parent. That ancestry is
intentional: future upstream commits now form a normal, short merge instead of replaying the old
fork across the whole tree. The pre-migration fork is retained as
`codex/legacy-master-0.5.8-799a664`.

## Remote and branch policy

Use these remote names consistently:

```bash
git remote set-url origin https://github.com/jerrydong1988/warpdrv.git
git remote add upstream https://github.com/mikjee/warpdrv.git
```

- `master` is always releasable and must contain the latest accepted upstream tip.
- Every synchronization uses a short-lived `codex/upstream-sync-YYYYMMDD` branch from
  `origin/master`.
- Merge `upstream/master` into that branch. Do not rebase or squash upstream history.
- Keep fork-only behavior in focused modules and tests; do not edit vendored/generated outputs.
- Enable recorded conflict reuse locally with `git config rerere.enabled true`.

## Routine sync

The scheduled `Upstream Drift` workflow compares the fork with upstream each Monday. A failure means
upstream has commits not present in the fork and should trigger a synchronization PR.

```bash
git fetch origin --prune
git fetch upstream --prune
git switch -c codex/upstream-sync-YYYYMMDD origin/master
git merge --no-ff upstream/master
```

Resolve conflicts upstream-first, then reapply the narrow fork delta. Pay special attention to these
capability boundaries:

1. `packages/app/src/i18n/` and `check-i18n.mjs`: both locales must have identical namespaces,
   placeholders, and plural pairs; new user-facing upstream strings must be translated.
2. `packages/server/src/services/processManager.ts` and `shared/flagMappings.ts`: preserve modern
   llama.cpp flags, capability negotiation, process-tree termination, log buffering, port release,
   stats polling, and checkpoint behavior.
3. `packages/warpmcp/src/`: preserve command allowlisting, path sandboxing, SSRF/private-address
   rejection, response limits, and MCP authorization.
4. `packages/server/src/middleware/`, `util/access.ts`, and `util/localOrigin.ts`: preserve auth,
   rate limiting, local-origin checks, and fail-closed access rules.
5. Model scanning/downloading and the Hub UI: preserve both Hugging Face and ModelScope behavior.
6. `packages/desktop/`, release workflows, and `release.json`: preserve Windows sidecar handling,
   MSI builds, and fork-owned update URLs.

## Required gates

Run every gate before opening or merging the PR:

```bash
npm ci
npm run i18n:check -w @warpcore/app
npm run lint
npm run lint:biome
npm run test:coverage
npx tsc -b packages/shared packages/realmcore packages/bridge packages/server packages/warpmcp packages/app --force
npm run build -w @warpcore/app
(cd landing && npm ci && npm run build)
(cd packages/desktop && cargo fmt --check && cargo clippy -- -D warnings)
```

On Windows, also run:

```powershell
npm run prepare:binaries -w @warpcore/desktop
Set-Location packages/desktop
npx tauri build --bundles msi
```

The ESLint warning ceiling is a net-warning baseline, not a target. It may be lowered when warnings
are removed; it must not be raised to admit a sync. CI, Windows MSI, and coverage checks must all be
green before merge. After merging, verify:

```bash
git merge-base --is-ancestor upstream/master origin/master
git status --short
```

## Conflict history

The original 2026-08 conflict survey remains in
[`upstream-sync-conflict-survey.md`](upstream-sync-conflict-survey.md). It documents why the recovery
required semantic integration rather than bulk `ours`/`theirs` choices. It is historical evidence,
not the current synchronization policy.
