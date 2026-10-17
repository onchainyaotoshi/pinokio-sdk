# @yaotoshi/pinokio-sdk

Typed, zero-dependency TypeScript client for scripts running on a [Pinokio](https://github.com/onchainyaotoshi/pinokio) gateway.

A Pinokio gateway hosts user-authored browser automations and functions and exposes each one as an asynchronous REST endpoint. The hard part of those scripts — the browser, the login session, the credentials — stays inside the gateway. This SDK is the typed way to ask the gateway to run one of them.

- **Zero runtime dependencies** — global `fetch` (Node 18+).
- **Dual ESM / CommonJS** — works with `import` and `require`.
- **Curated surface** — the default entry exposes named methods only, never a generic "run any script" call.
- **Typed errors** — discriminate on `PinokioSdkError.code`.

## Install

~~~bash
npm install @yaotoshi/pinokio-sdk
~~~

## Environment

~~~bash
PINOKIO_BASE_URL=https://pinokio.example.com   # the gateway (no trailing slash needed)
PINOKIO_API_KEY=pk_xxxx                              # created at <base URL>/apikeys
~~~

The API key is shown once at creation and starts with `pk_`. Every endpoint returns 401 without it.

## Quick start

~~~ts
import { fromEnv } from "@yaotoshi/pinokio-sdk";

const pk = fromEnv();

const { token, expiresAt, source } = await pk.browserAutomation.gineeUnofficialAuth.login({
  forceLogin: true,
});
~~~

`source` is `"session"` when the gateway reused an already-valid browser session (fast) and `"login"` when it performed a fresh sign-in (6–9s). Calling `login` on every need is correct — it never returns a stale token.

## Methods

| Method | Returns |
| --- | --- |
| `pk.browserAutomation.gineeUnofficialAuth.login({ forceLogin?, minRemainingSeconds? })` | `{ token, tokenType, expiresAt, source, user }` |
| `pk.browserAutomation.gineeUnofficialAuth.isExpired(token, { marginSeconds? })` | `{ expired, reason, expiresAt, expiresInSeconds, checkedBy }` |

`isExpired` is fail-closed: any unexpected answer from Ginee is reported as `expired: true` with `reason: "unknown"`.

## Escape hatch

Scripts that have no module yet are reachable through a separate entry point:

~~~ts
import { runScript } from "@yaotoshi/pinokio-sdk/raw";

const report = await runScript(pk, "functions/example/laporan-harian", { tanggal: "2026-10-17" }, {
  dryRun: true,
});
// report.wouldExecute → the writes that would have been sent

const result = await runScript(pk, "browser-automation/shopee/search", { q: "kopi" }, {
  dryRun: false, // required: there is no default
});
~~~

`dryRun` is **required** and the two values return different things: `true` yields a `DryRunReport`, `false` yields the script result. A dry run can never be mistaken for a real one.

## Errors

Every failure throws one class, `PinokioSdkError`, with a discriminated `code`:

| Code | Meaning |
| --- | --- |
| `MISSING_CONFIG` | `PINOKIO_BASE_URL` or `PINOKIO_API_KEY` missing / empty |
| `INVALID_REQUEST` | Malformed script id (must be `<archetype>/<workspace>/<script>`) |
| `AUTH_ERROR` | Gateway rejected the API key (401) |
| `SCRIPT_NOT_FOUND` | No such script (404 `ScriptNotFound`) |
| `RUN_NOT_FOUND` | Unknown run, or the result was already evicted (404 `RunNotFound`) |
| `RUN_FAILED` | The script itself failed — `message` carries the cause |
| `RUN_TIMED_OUT` | The script exceeded its manifest timeout |
| `RUN_CANCELLED` | The run was cancelled |
| `TIMEOUT` | A single HTTP request, or the whole poll, exceeded its deadline |
| `NETWORK_ERROR` | The gateway could not be reached |
| `API_ERROR` | Any other non-2xx — `serverCode` holds the gateway's own code |

Run the poll promptly: a settled run's result is evicted about five minutes after it finishes.

## Why the main entry is curated

A fixed method surface means a caller — including a coding agent — cannot invent a script id, pass a wrong parameter shape, or accidentally reach a script that writes state. Everything genuinely dynamic lives behind the explicit `/raw` import, where `dryRun` must be stated out loud.

## License

MIT
