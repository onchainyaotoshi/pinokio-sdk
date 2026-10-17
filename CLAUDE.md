# CLAUDE.md — pinokio-sdk

> Handoff context for the LLM that continues coding here. Read this first.

## What this is

`@yaotoshi/pinokio-sdk` — a tiny, fully-typed, **zero-dependency** TypeScript client for the script
API served by a Pinokio gateway (the deployment URL is supplied by the consumer, never hardcoded
here). Consumers install it from public npm, send a run, poll until it settles, and read the result.

The browser is **not** in this package. A Pinokio gateway owns the Chromium session, the Ginee
credentials, and the login flow; the SDK only talks HTTP to it. That is why this package can stay
zero-dependency — the same shape as `@yaotoshi/openclaw-wa-sdk`, where the gateway holds the
WhatsApp session.

## Current status

- Implemented: `src/` (client, transport, error, types, internal, raw, modules).
- Builds: `npm run build` → `dist/` (dual ESM/CJS, `.d.ts` + `.d.cts`, two entries).
- Tests: `npm run test` → 25 passing, `fetch` stubbed. No test touches a real gateway.
- Published: `@yaotoshi/pinokio-sdk@0.1.2` on 2026-10-17 with provenance (SLSA v1). Versions 0.1.0
  and 0.1.1 were withdrawn: deleting a version from the npm UI removed the whole package, so the
  name had to be re-registered under a fresh version.
- Live smoke (2026-10-17, dev gateway, published package): `login()` → `source: "session"`, token
  628 chars, expiry ~30 days, 3.9s; `isExpired()` on that token → `expired: false`, `reason:
  "valid"`, `checkedBy: "ginee"`. The fresh sign-in path (6–9s) was not exercised by this smoke.
- Package lint: `npm run lint:pub` → publint clean, attw green for node16 (CJS+ESM) and bundler.
  The node10 column is ignored on purpose (`--profile node16`): subpath exports are not a node10
  concept and `engines.node` is `>=18`.

## Environment

- `PINOKIO_BASE_URL` — gateway base URL (whatever the consumer deploys).
- `PINOKIO_API_KEY` — `pk_...` created at `<base URL>/apikeys`.

`fromEnv()` reads exactly these two and names the missing one in the error.

## Exact server contract (source of truth)

Mirror of `nest/src/scripts/scripts.controller.ts` in the pinokio repo. If the gateway changes,
update `src/transport.ts` and this file together.

- **Auth:** `Authorization: Bearer pk_...`. 401 → `AUTH_ERROR`.
- **Script id:** exactly `<archetype>/<workspace>/<script>` — three non-empty segments.
- **`POST /api/scripts/:archetype/:ns/:name`** — body is the script params plus control flags.
  Returns immediately `{ status: "started", runId }`. There is **no** synchronous mode.
  - `dryRun` defaults to **`true`** at the HTTP layer (`nest/src/scripts/scripts.service.ts:374`).
    In browser archetypes that default arms a CDP interceptor which fails every
    POST/PUT/PATCH/DELETE (`nest/src/core/scripts/harness/invoke.ts:380`). **Always send it
    explicitly.**
  - `confirmWrite: true` is required for scripts whose manifest declares
    `writeBehavior: "writesState"`.
- **`GET .../runs/:runId`** — `{ status, runId, reason?, error?: { message }, elapsedMs?, startTs?,
  wouldExecute?, logs?: [{ t, msg }], cursor? }`. `status` is `running | succeeded | failed |
  timed_out | cancelled`. The result is **never** in this response.
- **`GET .../runs/:runId/result`** — the script's result JSON. 404 `RunNotFound` (unknown run, or
  evicted ~5 minutes after the run settled), 503 `ResultStoreUnavailable`. `?maxBytes=N` truncates
  and sets `X-Run-Result-Truncated: 1` with `Content-Type: text/plain`.
- **`POST .../runs/:runId/cancel`** — accepts or reports an already-settled run.

## Locked design decisions

| Decision | Choice |
| --- | --- |
| Shape | client to the Pinokio gateway; no browser, no credentials here |
| Main entry | curated domain modules only — no generic runner exported |
| Escape hatch | `@yaotoshi/pinokio-sdk/raw` → `runScript()`, `dryRun` required |
| Naming | `pk.<archetype>.<workspace>.<script>()`, kebab → camelCase, no aliases |
| Token handling | none — no cache, no refresh, no persistence |
| Transport | start → poll (1.5s) → result, one request timeout (15s) + one run deadline (300s) |
| Errors | single `PinokioSdkError` with a discriminated `code` |
| Bundling | tsup, two entries, `splitting: false`; shared symbols use `Symbol.for` |
| Publish | public npm, GitHub Actions on `v*` tags with `--provenance` |

## Documents

- `docs/design.md` — design record: why a gateway client, the naming rule, protocol semantics,
  error taxonomy, and the rule for when a workspace earns a module. Canonical copy.
- `docs/plans/2026-10-17-pinokio-sdk-release.md` — the task-by-task plan for the release,
  with the deviations recorded at the bottom.

## Architecture

~~~
src/
  index.ts     # public entry: createPinokio, fromEnv, PinokioSdkError, types
  client.ts    # createPinokio/fromEnv, config validation, assembles modules
  transport.ts # requestJson, startRun, getRunSnapshot, waitForRun, getRunResult, executeScript
  error.ts     # PinokioSdkError + PinokioErrorCode + cross-bundle instanceof brand
  types.ts     # TransportConfig, RunStatus, RunSnapshot, RunLogLine
  internal.ts  # TRANSPORT symbol (Symbol.for — the two bundles must agree)
  raw.ts       # public entry ./raw: runScript + DryRunReport
  modules/
    spec.ts                                   # MODULE_SPECS — the single registration point
    index.ts                                  # builds the camelCase surface from MODULE_SPECS
    browser-automation/ginee-unofficial-auth.ts
~~~

Why `Symbol.for`: `splitting: false` means `dist/index.js` and `dist/raw.js` each carry their own copy
of `error.ts`. A plain `Symbol()` would make `instanceof` fail across the boundary; the global registry
plus `Symbol.hasInstance` keeps it working.

## Commands

~~~bash
npm install                        # dev deps (this host has omit=dev in ~/.npmrc → use --include=dev)
npm run build                      # tsup → dist/
npm run test                       # vitest run (25 tests)
npm run lint:pub                   # publint + attw --profile node16
npm pack --dry-run                 # inspect the published file list
~~~

## Remaining manual steps to publish

1. Repository secret **`NPM_TOKEN`** (granular npm token, publish rights on `@yaotoshi/*`) on
   `onchainyaotoshi/pinokio-sdk`.
2. `npm version patch|minor` then `git push --follow-tags` → `publish.yml` builds, tests, and runs
   `npm publish --provenance --access public`.
3. Provenance requires a **public** repository — keep it public. Note: GitHub Actions minutes are
   only limited on private repos, so staying public also keeps CI free.

## Adding a workspace module

Only add a module when at least one holds:

1. a hidden protocol order (e.g. check `exp` → verify → login),
2. hidden semantics that are easy to get wrong (e.g. `dryRun` defaulting to true, 5-minute result
   eviction), or
3. the same script is called repeatedly by consumers.

Otherwise leave it on `/raw` — new workspaces are usable on day one without an SDK release.

To add one:

1. Create `src/modules/<archetype>/<workspace>.ts` with the params/result types copied from that
   script's `manifest.json` (params and returns schemas), plus thin functions over `executeScript`
   that always pass `dryRun` explicitly.
2. Register the scripts in `MODULE_SPECS` (`src/modules/spec.ts`): `script` is the kebab-case name,
   `method` is its camelCase form — `test/naming.test.ts` asserts exactly that.
3. Add `test/fixtures/<archetype>__<workspace>__<script>.manifest.json` (trimmed to
   `name`, `writeBehavior`, `params`, `returns`). The naming test fails without it.
4. Add the types to `src/index.ts` exports and extend `Pinokio` in `src/client.ts`.
5. `npm run test && npm run build && npm run lint:pub`, then release a minor version.

## Gotchas

- `dryRun` default `true` is the single most dangerous default in this system. Never rely on it.
- The result endpoint is separate from the poll on purpose (results can be tens of MB) and evicts
  after ~5 minutes — fetch immediately after the run settles.
- A single HTTP request is cut off by the edge at ~100s; keep the request timeout well below that and
  bound the poll loop with a separate deadline.
- Tokens are credentials: never log them, never put them in error messages.
- `tsconfig` does not include `DOM`; `fetch`/`Response` types come from `@types/node`.
- Interfaces are not assignable to `Record<string, unknown>`; `GineeLoginParams` is a `type` alias on
  purpose.
