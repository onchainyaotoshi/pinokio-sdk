# pinokio-sdk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Publish @yaotoshi/pinokio-sdk v0.1.0 — a zero-dependency, typed client that runs scripts on a Pinokio gateway, with a curated domain module for the ginee-unofficial-auth workspace and a /raw escape hatch.

**Architecture:** One HTTP transport (start run, poll, fetch result) shared by every entry point. The main entry exposes only curated domain modules (pk.browserAutomation.gineeUnofficialAuth.login), so no caller — human or LLM — can invoke an arbitrary script ID from the default import. The /raw subpath exports runScript for scripts that have no module yet. Module and method names are derived mechanically from the script path, and a contract test keeps the mapping honest.

**Tech Stack:** TypeScript 5.7, tsup (dual ESM/CJS + d.ts), Vitest, publint + @arethetypeswrong/cli, GitHub Actions (CI + publish on a v* tag with provenance), Node 20 in CI. **Zero runtime dependencies** — global fetch only.

**Spec:** [docs/design.md](../design.md)

**Status:** executed 2026-10-17 — v0.1.0 published with provenance, live smoke green against the
dev gateway. Deviations recorded in "Implementation notes" at the bottom of this file.

## Global Constraints

- Zero runtime dependencies. Dev deps only: tsup, typescript, vitest, @types/node, publint, @arethetypeswrong/cli.
- Target directory: ~/pinokio-sdk (a **new repo**, sibling of openclaw-wa-sdk) — never inside the pinokio checkout.
- Package name @yaotoshi/pinokio-sdk; publishConfig.access is "public"; the GitHub repo onchainyaotoshi/pinokio-sdk must be **public** (provenance requirement).
- Git identity for every commit: Yaotoshi <142854977+onchainyaotoshi@users.noreply.github.com>. Never a personal email, never an absolute host path inside committed files.
- dryRun is **always sent explicitly** by the SDK. The server defaults it to true (nest/src/scripts/scripts.service.ts:374), which in browser archetypes arms a CDP interceptor that fails every POST/PUT/PATCH/DELETE (nest/src/core/scripts/harness/invoke.ts:380). Domain modules send dryRun: false; runScript makes the caller choose, and true/false have different return types.
- The main entry (@yaotoshi/pinokio-sdk) must **not** export any function that accepts a script ID. Enforced by a test.
- Tokens and API keys are never logged, never embedded in error messages, never persisted.
- No token cache, no background refresh, no disk persistence.
- Every test stubs fetch via vi.stubGlobal. No test may reach a real Pinokio instance or any Ginee endpoint. The only live path is the manual smoke in Task 5, against **dev**, never prod.
- Shared runtime identity across the two bundles uses Symbol.for(...): bundles are not code-split, so a plain Symbol() would differ between dist/index.js and dist/raw.js.

## File Structure

~~~
pinokio-sdk/
  package.json          # exports map: "." and "./raw"
  tsconfig.json
  tsup.config.ts        # entry: src/index.ts + src/raw.ts
  vitest.config.ts
  .gitignore
  LICENSE               # MIT
  README.md
  CLAUDE.md
  docs/design.md        # copy of the spec
  .github/workflows/ci.yml
  .github/workflows/publish.yml
  src/
    index.ts            # public: createPinokio, fromEnv, PinokioSdkError, types
    client.ts           # createPinokio(), fromEnv(), config validation, module assembly
    error.ts            # PinokioSdkError + PinokioErrorCode + cross-bundle brand
    types.ts            # TransportConfig, RunStatus, RunSnapshot, RunLogLine
    internal.ts         # Symbol.for keys shared by both entries
    transport.ts        # requestJson, startRun, waitForRun, getRunResult, executeScript
    raw.ts              # public: runScript + DryRunReport (subpath entry)
    modules/
      index.ts          # builds pk.<archetype>.<workspace> from MODULE_SPECS
      spec.ts           # MODULE_SPECS: the single list of exposed scripts
      browser-automation/ginee-unofficial-auth.ts
  test/
    transport.test.ts
    client.test.ts
    ginee.test.ts
    raw.test.ts
    naming.test.ts
    entry-surface.test.ts
    fixtures/
      browser-automation__ginee-unofficial-auth__login.manifest.json
      browser-automation__ginee-unofficial-auth__is-expired.manifest.json
~~~

---

### Task 1: Scaffold the package and its gates

**Files:**
- Create: ~/pinokio-sdk/package.json, tsconfig.json, tsup.config.ts, vitest.config.ts, .gitignore, LICENSE
- Create: src/index.ts, test/smoke.test.ts
- Create: .github/workflows/ci.yml, .github/workflows/publish.yml

**Interfaces:**
- Consumes: nothing.
- Produces: a repo where npm test, npm run build and npm run lint:pub all pass, and dist/index.js + dist/index.cjs + dist/index.d.ts exist.

- [ ] **Step 1: Create the directory and initialise git**

~~~bash
mkdir -p ~/pinokio-sdk/src ~/pinokio-sdk/test ~/pinokio-sdk/.github/workflows ~/pinokio-sdk/docs
cd ~/pinokio-sdk && git init -b main
git config user.name "Yaotoshi"
git config user.email "142854977+onchainyaotoshi@users.noreply.github.com"
~~~

- [ ] **Step 2: Write package.json**

~~~json
{
  "name": "@yaotoshi/pinokio-sdk",
  "version": "0.1.0",
  "description": "Typed, zero-dependency client for scripts running on a Pinokio gateway.",
  "type": "module",
  "license": "MIT",
  "author": "Yaotoshi",
  "homepage": "https://github.com/onchainyaotoshi/pinokio-sdk#readme",
  "repository": { "type": "git", "url": "git+https://github.com/onchainyaotoshi/pinokio-sdk.git" },
  "bugs": { "url": "https://github.com/onchainyaotoshi/pinokio-sdk/issues" },
  "keywords": ["pinokio", "sdk", "scripts", "automation", "typescript"],
  "files": ["dist", "README.md", "LICENSE"],
  "sideEffects": false,
  "engines": { "node": ">=18" },
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": { "import": "./dist/index.d.ts", "require": "./dist/index.d.cts" },
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    },
    "./raw": {
      "types": { "import": "./dist/raw.d.ts", "require": "./dist/raw.d.cts" },
      "import": "./dist/raw.js",
      "require": "./dist/raw.cjs"
    }
  },
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "prepublishOnly": "npm run build && npm run test",
    "lint:pub": "publint && attw --pack"
  },
  "publishConfig": { "access": "public", "registry": "https://registry.npmjs.org/" },
  "devDependencies": {
    "@arethetypeswrong/cli": "^0.18.3",
    "@types/node": "^20.17.0",
    "publint": "^0.3.0",
    "tsup": "^8.3.0",
    "typescript": "^5.7.0",
    "vitest": "^4.1.2"
  }
}
~~~

- [ ] **Step 3: Write tsconfig.json, tsup.config.ts, vitest.config.ts**

~~~json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "types": ["node"],
    "declaration": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "outDir": "dist",
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "test"]
}
~~~

~~~ts
// tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/raw.ts"],
  format: ["esm", "cjs"],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  keepNames: true,
  target: "es2022",
  platform: "neutral",
});
~~~

~~~ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
~~~

- [ ] **Step 4: Write the placeholder entry and its smoke test**

~~~ts
// src/index.ts (replaced in Task 3)
export const SDK_NAME = "@yaotoshi/pinokio-sdk";
~~~

~~~ts
// test/smoke.test.ts
import { describe, expect, it } from "vitest";
import { SDK_NAME } from "../src/index.js";

describe("package scaffold", () => {
  it("exposes the package name", () => {
    expect(SDK_NAME).toBe("@yaotoshi/pinokio-sdk");
  });
});
~~~

- [ ] **Step 5: Install and verify every gate**

~~~bash
cd ~/pinokio-sdk && npm install
npm test          # expect 1 passing test
npm run build     # expect dist/index.js, dist/index.cjs, dist/index.d.ts
npm run lint:pub  # expect publint + attw: no problems
~~~

- [ ] **Step 6: Write .gitignore, LICENSE, and both workflows**

~~~gitignore
node_modules/
dist/
*.log
.env
.DS_Store
~~~

LICENSE: standard MIT text, year 2026, copyright holder "Yaotoshi".

~~~yaml
# .github/workflows/ci.yml
name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
  workflow_dispatch:
permissions: { contents: read }
jobs:
  build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: npm }
      - run: npm ci
      - run: npm run build
      - run: npm run test
      - run: npm run lint:pub
~~~

~~~yaml
# .github/workflows/publish.yml
name: Publish to npm
on:
  push: { tags: ["v*"] }
  workflow_dispatch:
permissions: { contents: read, id-token: write }
jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", registry-url: "https://registry.npmjs.org" }
      - run: npm ci
      - run: npm run build
      - run: npm run test
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: GITHUB_SECRET_NPM_TOKEN
~~~

In the real file the NODE_AUTH_TOKEN line must reference the repository secret NPM_TOKEN using a GitHub expression; it is spelled GITHUB_SECRET_NPM_TOKEN here only to keep this document free of brace expressions.

- [ ] **Step 7: Commit**

~~~bash
cd ~/pinokio-sdk
git add -A
git commit -m "chore: scaffold pinokio-sdk with build, test, and publish gates"
~~~

---

### Task 2: Error taxonomy and the HTTP transport

**Files:**
- Create: src/error.ts, src/types.ts, src/internal.ts, src/transport.ts
- Test: test/transport.test.ts

**Interfaces:**
- Consumes: nothing from Task 1 except the toolchain.
- Produces:
  - class PinokioSdkError extends Error with code: PinokioErrorCode, status?: number, serverCode?: string, runId?: string
  - type TransportConfig = { baseUrl: string; apiKey: string; requestTimeoutMs?: number; pollIntervalMs?: number; deadlineMs?: number }
  - executeScript<T>(cfg, scriptId, params, { dryRun, confirmWrite? }): Promise<{ result: T; snapshot: RunSnapshot }>

- [ ] **Step 1: Write the failing transport tests**

~~~ts
// test/transport.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { executeScript } from "../src/transport.js";
import type { TransportConfig } from "../src/types.js";

const CFG: TransportConfig = {
  baseUrl: "https://pinokio.test",
  apiKey: "pk_test",
  pollIntervalMs: 1,
  deadlineMs: 5_000,
};

interface Call { url: string; method: string; body?: unknown }

function stubFetch(handlers: Array<() => { status: number; body: unknown }>): Call[] {
  const calls: Call[] = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({
        url: String(url),
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(String(init.body)) : undefined,
      });
      const { status, body } = handlers[Math.min(i++, handlers.length - 1)]!();
      return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("executeScript", () => {
  it("sends the script id, an explicit dryRun, and each call in order", async () => {
    const calls = stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "r1" } }),
      () => ({ status: 200, body: { status: "succeeded", runId: "r1" } }),
      () => ({ status: 200, body: { token: "abc" } }),
    ]);

    const { result } = await executeScript<{ token: string }>(
      CFG,
      "browser-automation/ginee-unofficial-auth/login",
      {},
      { dryRun: false },
    );

    expect(result).toEqual({ token: "abc" });
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.url).toBe(
      "https://pinokio.test/api/scripts/browser-automation/ginee-unofficial-auth/login",
    );
    expect(calls[0]!.body).toEqual({ dryRun: false });
    expect(calls[1]!.url).toBe(
      "https://pinokio.test/api/scripts/browser-automation/ginee-unofficial-auth/login/runs/r1",
    );
    expect(calls[2]!.url).toBe(
      "https://pinokio.test/api/scripts/browser-automation/ginee-unofficial-auth/login/runs/r1/result",
    );
  });

  it("polls until the run settles", async () => {
    const calls = stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "r2" } }),
      () => ({ status: 200, body: { status: "running", runId: "r2" } }),
      () => ({ status: 200, body: { status: "running", runId: "r2" } }),
      () => ({ status: 200, body: { status: "succeeded", runId: "r2" } }),
      () => ({ status: 200, body: 42 }),
    ]);

    const { result } = await executeScript<number>(CFG, "functions/ws/s", {}, { dryRun: true });
    expect(result).toBe(42);
    expect(calls.length).toBe(5);
  });

  it("maps a failed run to RUN_FAILED with the server reason", async () => {
    stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "r3" } }),
      () => ({
        status: 200,
        body: { status: "failed", runId: "r3", reason: "pool_exhausted", error: { message: "no page" } },
      }),
    ]);

    await expect(executeScript(CFG, "functions/ws/s", {}, { dryRun: false })).rejects.toMatchObject({
      code: "RUN_FAILED",
      runId: "r3",
    });
  });

  it("maps timed_out and cancelled", async () => {
    stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "r4" } }),
      () => ({ status: 200, body: { status: "timed_out", runId: "r4" } }),
    ]);
    await expect(executeScript(CFG, "functions/ws/s", {}, { dryRun: false })).rejects.toMatchObject({
      code: "RUN_TIMED_OUT",
    });

    stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "r5" } }),
      () => ({ status: 200, body: { status: "cancelled", runId: "r5" } }),
    ]);
    await expect(executeScript(CFG, "functions/ws/s", {}, { dryRun: false })).rejects.toMatchObject({
      code: "RUN_CANCELLED",
    });
  });

  it("maps 401 to AUTH_ERROR", async () => {
    stubFetch([
      () => ({ status: 401, body: { status: "error", code: "InvalidApiKey", message: "bad key" } }),
    ]);
    await expect(executeScript(CFG, "functions/ws/s", {}, { dryRun: false })).rejects.toMatchObject({
      code: "AUTH_ERROR",
      serverCode: "InvalidApiKey",
    });
  });

  it("maps ScriptNotFound and RunNotFound", async () => {
    stubFetch([
      () => ({ status: 404, body: { status: "error", code: "ScriptNotFound", message: "nope" } }),
    ]);
    await expect(executeScript(CFG, "functions/ws/s", {}, { dryRun: false })).rejects.toMatchObject({
      code: "SCRIPT_NOT_FOUND",
    });

    stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "r6" } }),
      () => ({ status: 404, body: { status: "error", code: "RunNotFound", message: "evicted" } }),
    ]);
    await expect(executeScript(CFG, "functions/ws/s", {}, { dryRun: false })).rejects.toMatchObject({
      code: "RUN_NOT_FOUND",
    });
  });

  it("maps a network failure to NETWORK_ERROR", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );
    await expect(executeScript(CFG, "functions/ws/s", {}, { dryRun: false })).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });

  it("honours the deadline while polling", async () => {
    stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "r7" } }),
      () => ({ status: 200, body: { status: "running", runId: "r7" } }),
    ]);
    await expect(
      executeScript({ ...CFG, deadlineMs: 20 }, "functions/ws/s", {}, { dryRun: false }),
    ).rejects.toMatchObject({ code: "TIMEOUT", runId: "r7" });
  });
});
~~~

- [ ] **Step 2: Run the tests and confirm they fail**

~~~bash
cd ~/pinokio-sdk && npx vitest run test/transport.test.ts
~~~

Expected: FAIL — cannot resolve import "../src/transport.js".

- [ ] **Step 3: Write error.ts, types.ts, internal.ts**

~~~ts
// src/error.ts
export type PinokioErrorCode =
  | "MISSING_CONFIG"
  | "INVALID_REQUEST"
  | "AUTH_ERROR"
  | "SCRIPT_NOT_FOUND"
  | "RUN_NOT_FOUND"
  | "RUN_FAILED"
  | "RUN_TIMED_OUT"
  | "RUN_CANCELLED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "API_ERROR";

export interface PinokioErrorOptions {
  status?: number;
  serverCode?: string;
  runId?: string;
  cause?: unknown;
}

const BRAND = Symbol.for("@yaotoshi/pinokio-sdk/error");

export class PinokioSdkError extends Error {
  readonly code: PinokioErrorCode;
  readonly status?: number;
  readonly serverCode?: string;
  readonly runId?: string;
  readonly cause?: unknown;
  /** Cross-bundle brand: dist/index.js and dist/raw.js each define their own class. */
  readonly [BRAND] = true;

  constructor(code: PinokioErrorCode, message: string, options: PinokioErrorOptions = {}) {
    super(message);
    this.name = "PinokioSdkError";
    this.code = code;
    if (options.status !== undefined) this.status = options.status;
    if (options.serverCode !== undefined) this.serverCode = options.serverCode;
    if (options.runId !== undefined) this.runId = options.runId;
    if (options.cause !== undefined) this.cause = options.cause;
  }

  /** True across bundle boundaries, where instanceof alone would fail. */
  static override [Symbol.hasInstance](value: unknown): boolean {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Record<symbol, unknown>)[BRAND] === true
    );
  }
}
~~~

~~~ts
// src/types.ts
export type RunStatus = "running" | "succeeded" | "failed" | "timed_out" | "cancelled";
export type TerminalStatus = Exclude<RunStatus, "running">;

export interface RunLogLine { t: number; msg: string }
export interface WouldExecuteEntry { method: string; url: string }

export interface RunSnapshot {
  status: RunStatus;
  runId: string;
  reason?: string;
  error?: { message?: string };
  elapsedMs?: number;
  startTs?: number;
  wouldExecute?: WouldExecuteEntry[];
  logs?: RunLogLine[];
  cursor?: number;
}

export interface TransportConfig {
  baseUrl: string;
  apiKey: string;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
  deadlineMs?: number;
}

export interface RunOptions { dryRun: boolean; confirmWrite?: boolean }
~~~

~~~ts
// src/internal.ts
/** Shared across dist/index.js and dist/raw.js — a plain Symbol() would diverge. */
export const TRANSPORT = Symbol.for("@yaotoshi/pinokio-sdk/transport");
~~~

- [ ] **Step 4: Write transport.ts**

~~~ts
// src/transport.ts
import { PinokioSdkError } from "./error.js";
import type { RunOptions, RunSnapshot, TerminalStatus, TransportConfig } from "./types.js";

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_INTERVAL_MS = 1_500;
const DEFAULT_DEADLINE_MS = 300_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function splitScriptId(scriptId: string): [string, string, string] {
  const parts = scriptId.split("/");
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
    throw new PinokioSdkError(
      "INVALID_REQUEST",
      'Script id must be "<archetype>/<workspace>/<script>", received "' + scriptId + '"',
    );
  }
  return [parts[0]!, parts[1]!, parts[2]!];
}

function scriptPath(scriptId: string): string {
  return "/api/scripts/" + splitScriptId(scriptId).join("/");
}

function mapHttpError(status: number, body: unknown): PinokioSdkError {
  const record = (body ?? {}) as { code?: unknown; message?: unknown };
  const serverCode = typeof record.code === "string" ? record.code : undefined;
  const serverMessage = typeof record.message === "string" ? record.message : "HTTP " + status;

  if (status === 401) {
    return new PinokioSdkError("AUTH_ERROR", "Pinokio rejected the API key: " + serverMessage, {
      status,
      ...(serverCode ? { serverCode } : {}),
    });
  }
  if (status === 404 && serverCode === "ScriptNotFound") {
    return new PinokioSdkError("SCRIPT_NOT_FOUND", serverMessage, {
      status,
      ...(serverCode ? { serverCode } : {}),
    });
  }
  if (status === 404 && serverCode === "RunNotFound") {
    return new PinokioSdkError(
      "RUN_NOT_FOUND",
      serverMessage +
        ". Run results are evicted about 5 minutes after the run settles — fetch the result immediately after it finishes.",
      { status, ...(serverCode ? { serverCode } : {}) },
    );
  }
  return new PinokioSdkError("API_ERROR", serverMessage, {
    status,
    ...(serverCode ? { serverCode } : {}),
  });
}

async function requestJson(cfg: TransportConfig, path: string, init: RequestInit): Promise<unknown> {
  const timeoutMs = cfg.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(cfg.baseUrl.replace(/\/+$/, "") + path, {
      ...init,
      headers: {
        authorization: "Bearer " + cfg.apiKey,
        "content-type": "application/json",
        accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new PinokioSdkError("TIMEOUT", "Request timed out after " + timeoutMs + "ms: " + path, {
        cause: error,
      });
    }
    throw new PinokioSdkError(
      "NETWORK_ERROR",
      "Could not reach " + cfg.baseUrl + ": " + (error as Error).message,
      { cause: error },
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text.length > 0 ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!res.ok) throw mapHttpError(res.status, body);
  if (body === null) {
    throw new PinokioSdkError("API_ERROR", "Non-JSON response (HTTP " + res.status + ") from " + path);
  }
  return body;
}

export async function startRun(
  cfg: TransportConfig,
  scriptId: string,
  params: Record<string, unknown>,
  options: RunOptions,
): Promise<string> {
  const body: Record<string, unknown> = { ...params, dryRun: options.dryRun };
  if (options.confirmWrite !== undefined) body.confirmWrite = options.confirmWrite;

  const json = (await requestJson(cfg, scriptPath(scriptId), {
    method: "POST",
    body: JSON.stringify(body),
  })) as { status?: unknown; runId?: unknown };

  if (json.status !== "started" || typeof json.runId !== "string") {
    throw new PinokioSdkError("API_ERROR", "Unexpected start response for " + scriptId);
  }
  return json.runId;
}

export async function getRunSnapshot(
  cfg: TransportConfig,
  scriptId: string,
  runId: string,
): Promise<RunSnapshot> {
  return (await requestJson(cfg, scriptPath(scriptId) + "/runs/" + runId, {
    method: "GET",
  })) as RunSnapshot;
}

export async function waitForRun(
  cfg: TransportConfig,
  scriptId: string,
  runId: string,
): Promise<RunSnapshot> {
  const deadline = Date.now() + (cfg.deadlineMs ?? DEFAULT_DEADLINE_MS);
  for (;;) {
    const snapshot = await getRunSnapshot(cfg, scriptId, runId);
    if (snapshot.status !== "running") return snapshot;
    if (Date.now() >= deadline) {
      throw new PinokioSdkError(
        "TIMEOUT",
        "Run " + runId + " did not settle within " + (cfg.deadlineMs ?? DEFAULT_DEADLINE_MS) + "ms",
        { runId },
      );
    }
    await sleep(cfg.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  }
}

export async function getRunResult<T>(
  cfg: TransportConfig,
  scriptId: string,
  runId: string,
): Promise<T> {
  return (await requestJson(cfg, scriptPath(scriptId) + "/runs/" + runId + "/result", {
    method: "GET",
  })) as T;
}

function assertSettled(snapshot: RunSnapshot): void {
  const status = snapshot.status as TerminalStatus;
  if (status === "succeeded") return;
  if (status === "failed") {
    const detail = snapshot.error?.message ?? snapshot.reason ?? "unknown cause";
    throw new PinokioSdkError("RUN_FAILED", "Run " + snapshot.runId + " failed: " + detail, {
      runId: snapshot.runId,
    });
  }
  if (status === "timed_out") {
    throw new PinokioSdkError("RUN_TIMED_OUT", "Run " + snapshot.runId + " timed out script-side", {
      runId: snapshot.runId,
    });
  }
  throw new PinokioSdkError("RUN_CANCELLED", "Run " + snapshot.runId + " was cancelled", {
    runId: snapshot.runId,
  });
}

export async function executeScript<T>(
  cfg: TransportConfig,
  scriptId: string,
  params: Record<string, unknown>,
  options: RunOptions,
): Promise<{ result: T; snapshot: RunSnapshot }> {
  const runId = await startRun(cfg, scriptId, params, options);
  const snapshot = await waitForRun(cfg, scriptId, runId);
  assertSettled(snapshot);
  const result = await getRunResult<T>(cfg, scriptId, runId);
  return { result, snapshot };
}
~~~

- [ ] **Step 5: Run the tests and confirm they pass**

~~~bash
cd ~/pinokio-sdk && npx vitest run test/transport.test.ts
~~~

Expected: PASS — 9 tests.

- [ ] **Step 6: Commit**

~~~bash
cd ~/pinokio-sdk
git add src test
git commit -m "feat: add error taxonomy and the run transport"
~~~

---

### Task 3: Client surface and the ginee domain module

**Files:**
- Create: src/client.ts, src/modules/spec.ts, src/modules/index.ts, src/modules/browser-automation/ginee-unofficial-auth.ts
- Modify: src/index.ts (replace the placeholder export)
- Test: test/client.test.ts, test/ginee.test.ts, test/naming.test.ts
- Create fixtures: test/fixtures/browser-automation__ginee-unofficial-auth__login.manifest.json and test/fixtures/browser-automation__ginee-unofficial-auth__is-expired.manifest.json

**Interfaces:**
- Consumes: executeScript, TransportConfig, PinokioSdkError from Task 2.
- Produces:
  - createPinokio(config: PinokioConfig): Pinokio
  - fromEnv(env?: NodeJS.ProcessEnv): Pinokio
  - interface Pinokio { browserAutomation: { gineeUnofficialAuth: GineeUnofficialAuth } }
  - interface GineeUnofficialAuth { login(params?: GineeLoginParams): Promise<GineeLoginResult>; isExpired(token: string, options?: { marginSeconds?: number }): Promise<GineeIsExpiredResult> }
  - Pinokio carries the transport config under the non-enumerable symbol TRANSPORT from src/internal.ts.

- [ ] **Step 1: Write the failing client test**

~~~ts
// test/client.test.ts
import { describe, expect, it } from "vitest";
import { createPinokio, fromEnv } from "../src/client.js";

const TRANSPORT = Symbol.for("@yaotoshi/pinokio-sdk/transport");

describe("createPinokio", () => {
  it("rejects a missing base URL", () => {
    expect(() => createPinokio({ baseUrl: "", apiKey: "pk_x" })).toThrowError(/base URL/i);
  });

  it("rejects a missing API key", () => {
    expect(() => createPinokio({ baseUrl: "https://pinokio.test", apiKey: "" })).toThrowError(/api key/i);
  });

  it("strips a trailing slash from the base URL", () => {
    const pk = createPinokio({ baseUrl: "https://pinokio.test/", apiKey: "pk_x" });
    const cfg = (pk as unknown as Record<symbol, { baseUrl: string }>)[TRANSPORT]!;
    expect(cfg.baseUrl).toBe("https://pinokio.test");
  });

  it("exposes the ginee module with both methods", () => {
    const pk = createPinokio({ baseUrl: "https://pinokio.test", apiKey: "pk_x" });
    expect(typeof pk.browserAutomation.gineeUnofficialAuth.login).toBe("function");
    expect(typeof pk.browserAutomation.gineeUnofficialAuth.isExpired).toBe("function");
  });
});

describe("fromEnv", () => {
  it("reads PINOKIO_BASE_URL and PINOKIO_API_KEY", () => {
    const pk = fromEnv({ PINOKIO_BASE_URL: "https://pinokio.test", PINOKIO_API_KEY: "pk_x" });
    expect(pk).toBeDefined();
  });

  it("names the missing variable", () => {
    expect(() => fromEnv({})).toThrowError(/PINOKIO_BASE_URL/);
    expect(() => fromEnv({ PINOKIO_BASE_URL: "https://pinokio.test" })).toThrowError(/PINOKIO_API_KEY/);
  });
});
~~~

- [ ] **Step 2: Write the failing ginee test**

~~~ts
// test/ginee.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinokio } from "../src/client.js";

function stubFetch(handlers: Array<() => { status: number; body: unknown }>) {
  const calls: Array<{ url: string; body?: unknown }> = [];
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url: String(url), body: init.body ? JSON.parse(String(init.body)) : undefined });
      const { status, body } = handlers[Math.min(i++, handlers.length - 1)]!();
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}

const pk = createPinokio({ baseUrl: "https://pinokio.test", apiKey: "pk_test", pollIntervalMs: 1 });

afterEach(() => vi.unstubAllGlobals());

describe("gineeUnofficialAuth.login", () => {
  it("always sends dryRun:false and returns the typed result", async () => {
    const calls = stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "g1" } }),
      () => ({ status: 200, body: { status: "succeeded", runId: "g1" } }),
      () => ({
        status: 200,
        body: {
          token: "tkn",
          tokenType: "Bearer",
          expiresAt: "2026-11-16T02:54:12.000Z",
          source: "login",
          user: { id: "U1", username: "PNK", countryCode: "ID", accountLevel: "TIER_2" },
        },
      }),
    ]);

    const result = await pk.browserAutomation.gineeUnofficialAuth.login({ forceLogin: true });
    expect(result.token).toBe("tkn");
    expect(result.source).toBe("login");
    expect(calls[0]!.body).toEqual({ forceLogin: true, dryRun: false });
  });
});

describe("gineeUnofficialAuth.isExpired", () => {
  it("forwards token and marginSeconds, and sends dryRun:false", async () => {
    const calls = stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "g2" } }),
      () => ({ status: 200, body: { status: "succeeded", runId: "g2" } }),
      () => ({
        status: 200,
        body: {
          expired: true,
          reason: "expired",
          expiresAt: "2023-11-14T22:13:20.000Z",
          expiresInSeconds: 0,
          checkedBy: "local",
        },
      }),
    ]);

    const result = await pk.browserAutomation.gineeUnofficialAuth.isExpired("raw.token", {
      marginSeconds: 60,
    });
    expect(result.expired).toBe(true);
    expect(calls[0]!.body).toEqual({ token: "raw.token", marginSeconds: 60, dryRun: false });
  });
});
~~~

- [ ] **Step 3: Write the failing naming test**

~~~ts
// test/naming.test.ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MODULE_SPECS } from "../src/modules/spec.js";

/** Independent implementation — deliberately not imported from src. */
const camel = (kebab: string) => kebab.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

describe("module naming contract", () => {
  it("uses the script name as the method name, camelCased", () => {
    for (const moduleSpec of MODULE_SPECS) {
      for (const script of moduleSpec.scripts) {
        expect(script.method).toBe(camel(script.script));
      }
    }
  });

  it("only uses script names that camelCase reversibly", () => {
    for (const moduleSpec of MODULE_SPECS) {
      for (const script of moduleSpec.scripts) {
        expect(script.script).toMatch(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/);
        expect(script.script.includes("--")).toBe(false);
      }
    }
  });

  it("has a manifest fixture for every exposed script", () => {
    for (const moduleSpec of MODULE_SPECS) {
      for (const script of moduleSpec.scripts) {
        const file =
          moduleSpec.archetype + "__" + moduleSpec.workspace + "__" + script.script + ".manifest.json";
        const manifest = JSON.parse(readFileSync(join(__dirname, "fixtures", file), "utf8")) as {
          name: string;
        };
        expect(manifest.name).toBe(script.script);
      }
    }
  });
});
~~~

- [ ] **Step 4: Run the tests and confirm they fail**

~~~bash
cd ~/pinokio-sdk && npx vitest run test/client.test.ts test/ginee.test.ts test/naming.test.ts
~~~

Expected: FAIL — cannot resolve import "../src/client.js".

- [ ] **Step 5: Create the manifest fixtures from the real workspace**

~~~bash
cd ~/pinokio-sdk
SRC=~/.pinokio/scripts/browser-automation/ginee-unofficial-auth
for name in login is-expired; do
  node -e '
    const fs = require("fs");
    const src = process.argv[1], dest = process.argv[2];
    const m = JSON.parse(fs.readFileSync(src, "utf8"));
    fs.writeFileSync(dest, JSON.stringify({ name: m.name, writeBehavior: m.writeBehavior, params: m.params, returns: m.returns }, null, 2) + "\n");
  ' "$SRC/$name/manifest.json" "test/fixtures/browser-automation__ginee-unofficial-auth__$name.manifest.json"
done
ls test/fixtures
~~~

Expected: two fixture files. If the workspace is not present on this machine, copy the params/returns schemas from docs/brainstorms/2026-10-17-pinokio-sdk-design.md instead — never invent them.

- [ ] **Step 6: Write the domain module**

~~~ts
// src/modules/browser-automation/ginee-unofficial-auth.ts
import { executeScript } from "../../transport.js";
import type { TransportConfig } from "../../types.js";

const WORKSPACE = "browser-automation/ginee-unofficial-auth";

export interface GineeLoginParams {
  /** Force a fresh sign-in even when the browser session is still valid. */
  forceLogin?: boolean;
  /** Force a fresh sign-in when the session token has at most this many seconds left. */
  minRemainingSeconds?: number;
}

export interface GineeLoginResult {
  token: string;
  tokenType: "Bearer";
  expiresAt: string | null;
  source: "session" | "login";
  user: {
    id: string | null;
    username: string | null;
    countryCode: string | null;
    accountLevel: string | null;
  };
}

export type GineeExpiryReason =
  | "valid"
  | "expired"
  | "expiring"
  | "invalid"
  | "logged_out"
  | "unknown";

export interface GineeIsExpiredResult {
  expired: boolean;
  reason: GineeExpiryReason;
  expiresAt: string | null;
  expiresInSeconds: number | null;
  checkedBy: "local" | "ginee";
}

export interface GineeUnofficialAuth {
  /** Fetch a Ginee access token. Reuses the gateway browser session when it is still valid. */
  login(params?: GineeLoginParams): Promise<GineeLoginResult>;
  /** Ask Ginee whether a token is still usable. Never mutates anything. */
  isExpired(token: string, options?: { marginSeconds?: number }): Promise<GineeIsExpiredResult>;
}

export async function login(
  cfg: TransportConfig,
  params: GineeLoginParams = {},
): Promise<GineeLoginResult> {
  const { result } = await executeScript<GineeLoginResult>(cfg, WORKSPACE + "/login", params, {
    dryRun: false,
  });
  return result;
}

export async function isExpired(
  cfg: TransportConfig,
  token: string,
  options: { marginSeconds?: number } = {},
): Promise<GineeIsExpiredResult> {
  const params: Record<string, unknown> = { token };
  if (options.marginSeconds !== undefined) params.marginSeconds = options.marginSeconds;
  const { result } = await executeScript<GineeIsExpiredResult>(
    cfg,
    WORKSPACE + "/is-expired",
    params,
    { dryRun: false },
  );
  return result;
}
~~~

- [ ] **Step 7: Write the module spec and the builder**

~~~ts
// src/modules/spec.ts
import type { TransportConfig } from "../types.js";
import {
  isExpired,
  login,
  type GineeLoginParams,
} from "./browser-automation/ginee-unofficial-auth.js";

export interface ScriptSpec {
  /** kebab-case script name, exactly as the workspace directory names it. */
  script: string;
  /** camelCase method name; naming.test.ts asserts it equals camel(script). */
  method: string;
  invoke: (cfg: TransportConfig, args: readonly unknown[]) => Promise<unknown>;
}

export interface ModuleSpec {
  archetype: string;
  workspace: string;
  scripts: readonly ScriptSpec[];
}

export const MODULE_SPECS: readonly ModuleSpec[] = [
  {
    archetype: "browser-automation",
    workspace: "ginee-unofficial-auth",
    scripts: [
      {
        script: "login",
        method: "login",
        invoke: (cfg, args) => login(cfg, (args[0] ?? {}) as GineeLoginParams),
      },
      {
        script: "is-expired",
        method: "isExpired",
        invoke: (cfg, args) =>
          isExpired(cfg, args[0] as string, (args[1] ?? {}) as { marginSeconds?: number }),
      },
    ],
  },
];
~~~

~~~ts
// src/modules/index.ts
import type { TransportConfig } from "../types.js";
import { MODULE_SPECS } from "./spec.js";

type Leaf = Record<string, unknown>;

const camel = (segment: string) => segment.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

export function buildModules(cfg: TransportConfig): Record<string, Record<string, Leaf>> {
  const modules: Record<string, Record<string, Leaf>> = {};
  for (const spec of MODULE_SPECS) {
    const archetypeKey = camel(spec.archetype);
    const workspaceKey = camel(spec.workspace);
    modules[archetypeKey] ??= {};
    const workspace = (modules[archetypeKey]![workspaceKey] ??= {});
    for (const script of spec.scripts) {
      workspace[script.method] = (...args: unknown[]) => script.invoke(cfg, args);
    }
  }
  return modules;
}
~~~

- [ ] **Step 8: Write the client and the public entry**

~~~ts
// src/client.ts
import { PinokioSdkError } from "./error.js";
import { TRANSPORT } from "./internal.js";
import { buildModules } from "./modules/index.js";
import type { GineeUnofficialAuth } from "./modules/browser-automation/ginee-unofficial-auth.js";
import type { TransportConfig } from "./types.js";

export interface PinokioConfig {
  baseUrl: string;
  apiKey: string;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
  deadlineMs?: number;
}

export interface Pinokio {
  browserAutomation: { gineeUnofficialAuth: GineeUnofficialAuth };
  readonly [TRANSPORT]: TransportConfig;
}

export function createPinokio(config: PinokioConfig): Pinokio {
  if (typeof config.baseUrl !== "string" || config.baseUrl.trim() === "") {
    throw new PinokioSdkError("MISSING_CONFIG", "createPinokio requires a base URL (PINOKIO_BASE_URL).");
  }
  if (typeof config.apiKey !== "string" || config.apiKey.trim() === "") {
    throw new PinokioSdkError(
      "MISSING_CONFIG",
      "createPinokio requires an API key (PINOKIO_API_KEY), created at <base URL>/apikeys.",
    );
  }

  const cfg: TransportConfig = { baseUrl: config.baseUrl.trim().replace(/\/+$/, ""), apiKey: config.apiKey.trim() };
  if (config.requestTimeoutMs !== undefined) cfg.requestTimeoutMs = config.requestTimeoutMs;
  if (config.pollIntervalMs !== undefined) cfg.pollIntervalMs = config.pollIntervalMs;
  if (config.deadlineMs !== undefined) cfg.deadlineMs = config.deadlineMs;

  const client = buildModules(cfg) as unknown as Pinokio;
  Object.defineProperty(client, TRANSPORT, { value: cfg, enumerable: false, writable: false });
  return client;
}

export function fromEnv(env: NodeJS.ProcessEnv = process.env): Pinokio {
  const baseUrl = env.PINOKIO_BASE_URL;
  const apiKey = env.PINOKIO_API_KEY;
  if (!baseUrl) {
    throw new PinokioSdkError("MISSING_CONFIG", "PINOKIO_BASE_URL is not set (e.g. https://pinokio.example.com).");
  }
  if (!apiKey) {
    throw new PinokioSdkError("MISSING_CONFIG", "PINOKIO_API_KEY is not set — create one at <base URL>/apikeys.");
  }
  return createPinokio({ baseUrl, apiKey });
}
~~~

~~~ts
// src/index.ts
export { createPinokio, fromEnv } from "./client.js";
export type { Pinokio, PinokioConfig } from "./client.js";
export { PinokioSdkError } from "./error.js";
export type { PinokioErrorCode, PinokioErrorOptions } from "./error.js";
export type { RunSnapshot, RunStatus, RunLogLine, WouldExecuteEntry } from "./types.js";
export type {
  GineeLoginParams,
  GineeLoginResult,
  GineeUnofficialAuth,
  GineeIsExpiredResult,
  GineeExpiryReason,
} from "./modules/browser-automation/ginee-unofficial-auth.js";
~~~

- [ ] **Step 9: Run the suite and build**

~~~bash
cd ~/pinokio-sdk
npm test
npm run build
~~~

Expected: all tests pass; dist/index.js exports createPinokio, fromEnv, PinokioSdkError.

- [ ] **Step 10: Commit**

~~~bash
cd ~/pinokio-sdk
git add -A
git commit -m "feat(ginee): add the typed client and the ginee-unofficial-auth module"
~~~

---

### Task 4: The /raw escape hatch

**Files:**
- Create: src/raw.ts
- Test: test/raw.test.ts, test/entry-surface.test.ts

**Interfaces:**
- Consumes: Pinokio (with the TRANSPORT symbol), executeScript, startRun, waitForRun.
- Produces:
  - runScript<T>(pk, scriptId, params, { dryRun: false; confirmWrite?: boolean }): Promise<T>
  - runScript(pk, scriptId, params, { dryRun: true }): Promise<DryRunReport>
  - interface DryRunReport { dryRun: true; wouldExecute: WouldExecuteEntry[]; logs?: RunLogLine[] }

- [ ] **Step 1: Write the failing raw test**

~~~ts
// test/raw.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPinokio } from "../src/client.js";
import { runScript } from "../src/raw.js";

function stubFetch(handlers: Array<() => { status: number; body: unknown }>) {
  let i = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const { status, body } = handlers[Math.min(i++, handlers.length - 1)]!();
      return new Response(JSON.stringify(body), { status });
    }),
  );
}

const pk = createPinokio({ baseUrl: "https://pinokio.test", apiKey: "pk_test", pollIntervalMs: 1 });

afterEach(() => vi.unstubAllGlobals());

describe("runScript", () => {
  it("returns the script result when dryRun is false", async () => {
    stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "x1" } }),
      () => ({ status: 200, body: { status: "succeeded", runId: "x1" } }),
      () => ({ status: 200, body: { urls: ["a"] } }),
    ]);
    await expect(
      runScript<{ urls: string[] }>(pk, "functions/ws/crawl", {}, { dryRun: false }),
    ).resolves.toEqual({ urls: ["a"] });
  });

  it("returns a dry-run report instead of a result when dryRun is true", async () => {
    stubFetch([
      () => ({ status: 200, body: { status: "started", runId: "x2" } }),
      () => ({
        status: 200,
        body: {
          status: "succeeded",
          runId: "x2",
          wouldExecute: [{ method: "POST", url: "https://target.test/order" }],
        },
      }),
    ]);
    const report = await runScript(pk, "functions/ws/write", {}, { dryRun: true });
    expect(report.dryRun).toBe(true);
    expect(report.wouldExecute).toEqual([{ method: "POST", url: "https://target.test/order" }]);
  });

  it("rejects a malformed script id before making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(runScript(pk, "not-an-id", {}, { dryRun: false })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
~~~

- [ ] **Step 2: Write the failing entry-surface test**

~~~ts
// test/entry-surface.test.ts
import { describe, expect, it } from "vitest";
import * as main from "../src/index.js";

describe("main entry surface", () => {
  it("does not export a generic script runner", () => {
    expect(Object.keys(main)).not.toContain("runScript");
  });

  it("exports the curated surface", () => {
    expect(typeof main.createPinokio).toBe("function");
    expect(typeof main.fromEnv).toBe("function");
    expect(typeof main.PinokioSdkError).toBe("function");
  });
});
~~~

- [ ] **Step 3: Run them and confirm they fail**

~~~bash
cd ~/pinokio-sdk && npx vitest run test/raw.test.ts test/entry-surface.test.ts
~~~

Expected: FAIL — cannot resolve import "../src/raw.js".

- [ ] **Step 4: Write src/raw.ts**

~~~ts
// src/raw.ts
import { TRANSPORT } from "./internal.js";
import type { Pinokio } from "./client.js";
import { executeScript, startRun, waitForRun } from "./transport.js";
import type { RunLogLine, TransportConfig, WouldExecuteEntry } from "./types.js";

export interface RawRunOptions {
  /** Required. The server defaults to true, so the SDK never guesses. */
  dryRun: boolean;
  /** Set for scripts whose manifest declares writeBehavior: "writesState". */
  confirmWrite?: boolean;
}

export interface DryRunReport {
  dryRun: true;
  wouldExecute: WouldExecuteEntry[];
  logs?: RunLogLine[];
}

function transportOf(pk: Pinokio): TransportConfig {
  const cfg = (pk as unknown as Record<symbol, TransportConfig>)[TRANSPORT];
  if (!cfg) throw new Error("runScript() needs a client built by createPinokio() or fromEnv()");
  return cfg;
}

export function runScript<T>(
  pk: Pinokio,
  scriptId: string,
  params: Record<string, unknown>,
  options: RawRunOptions & { dryRun: false },
): Promise<T>;
export function runScript(
  pk: Pinokio,
  scriptId: string,
  params: Record<string, unknown>,
  options: RawRunOptions & { dryRun: true },
): Promise<DryRunReport>;
export async function runScript(
  pk: Pinokio,
  scriptId: string,
  params: Record<string, unknown>,
  options: RawRunOptions,
): Promise<unknown> {
  const cfg = transportOf(pk);
  const runOptions = options.confirmWrite !== undefined
    ? { dryRun: options.dryRun, confirmWrite: options.confirmWrite }
    : { dryRun: options.dryRun };

  if (options.dryRun) {
    const runId = await startRun(cfg, scriptId, params, runOptions);
    const snapshot = await waitForRun(cfg, scriptId, runId);
    return { dryRun: true, wouldExecute: snapshot.wouldExecute ?? [], logs: snapshot.logs };
  }

  const { result } = await executeScript<unknown>(cfg, scriptId, params, runOptions);
  return result;
}
~~~

- [ ] **Step 5: Run the full suite, build, and lint the package**

~~~bash
cd ~/pinokio-sdk
npm test
npm run build
npm run lint:pub
ls dist
~~~

Expected: all tests pass; dist contains index.js, index.cjs, index.d.ts, raw.js, raw.cjs, raw.d.ts; publint clean; attw reports no problems.

- [ ] **Step 6: Verify the tarball contents**

~~~bash
cd ~/pinokio-sdk && npm pack --dry-run
~~~

Expected: dist/index.js, dist/index.cjs, dist/index.d.ts, dist/raw.js, dist/raw.cjs, dist/raw.d.ts, README.md, LICENSE — and no src/ or test/.

- [ ] **Step 7: Commit**

~~~bash
cd ~/pinokio-sdk
git add -A
git commit -m "feat(raw): add the opt-in runScript escape hatch"
~~~

---

### Task 5: Documentation, first release, and a dev smoke

**Files:**
- Create: README.md, CLAUDE.md, docs/design.md
- Modify: none

**Interfaces:**
- Consumes: the finished surface from Tasks 1–4.
- Produces: a published v0.1.0 plus the handoff document a fresh session needs.

- [ ] **Step 1: Copy the spec into the repo**

~~~bash
cp ~/pinokio/.worktrees/spec-pinokio-sdk/docs/brainstorms/2026-10-17-pinokio-sdk-design.md \
   ~/pinokio-sdk/docs/design.md
~~~

If the spec lives elsewhere at execution time, copy it from wherever it is — do not rewrite it from memory.

- [ ] **Step 2: Write README.md**

Required sections, in order:

1. One paragraph: what this is, who it is for, and why the browser part is not here (the Pinokio gateway runs the browser; the SDK only talks to it).
2. Install: npm install @yaotoshi/pinokio-sdk.
3. Environment: PINOKIO_BASE_URL (dev or live) and PINOKIO_API_KEY (created at <base URL>/apikeys).
4. Quick start: fromEnv() then pk.browserAutomation.gineeUnofficialAuth.login({ forceLogin: true }), showing destructuring of token, expiresAt, source.
5. Methods table: login(params) and isExpired(token, options).
6. Escape hatch: import { runScript } from "@yaotoshi/pinokio-sdk/raw", with a call that passes dryRun: false explicitly, plus a sentence that dryRun: true returns a DryRunReport instead of a result, and that the main entry deliberately exposes no generic runner.
7. Error codes table: every PinokioErrorCode with a one-line cause and fix.
8. "Why the main entry is curated": a short paragraph — a fixed method surface means an agent cannot pick a wrong script or invent one.

- [ ] **Step 3: Write CLAUDE.md**

Sections, mirroring openclaw-wa-sdk/CLAUDE.md:

- **What this is** — one paragraph plus the zero-dependency and curated-entry decisions.
- **Current status** — implemented files, build/test/publish state.
- **Exact server contract** — POST /api/scripts/:archetype/:ns/:name returns { status: "started", runId }; GET .../runs/:runId returns { status, runId, reason?, error?, elapsedMs?, startTs?, wouldExecute?, logs?, cursor? }; GET .../runs/:runId/result returns the raw result JSON (404 RunNotFound, 503 ResultStoreUnavailable, ?maxBytes truncates and sets X-Run-Result-Truncated); POST .../runs/:runId/cancel. Record the dryRun default (true) and the ~5 minute result eviction here.
- **Locked design decisions** — table: curated main entry, /raw subpath, mechanical camelCase naming, no token cache, zero runtime deps, dual ESM/CJS.
- **Architecture** — the file map from this plan.
- **Commands** — install, build, test, lint:pub, pack dry run.
- **Remaining manual steps to first publish** — public GitHub repo, NPM_TOKEN secret, tag push, provenance requires a public repo.
- **Adding a workspace module** — the four steps (create the module file, register it in MODULE_SPECS, add the manifest fixture, release a minor), plus the rule for when a module is justified at all (hidden protocol order, hidden semantics, repeated use) and the reminder that /raw covers everything else on day one.

- [ ] **Step 4: Verify docs match code**

~~~bash
cd ~/pinokio-sdk
npx tsc --noEmit
npm test
grep -c PINOKIO_BASE_URL README.md CLAUDE.md
~~~

Expected: tsc clean, tests pass, both files mention both variables.

- [ ] **Step 5: Commit and create the public repo**

~~~bash
cd ~/pinokio-sdk
git add -A
git commit -m "docs: add README, CLAUDE.md, and the design record"
gh repo create onchainyaotoshi/pinokio-sdk --public --source=. --remote=origin --push
~~~

- [ ] **Step 6: Publish v0.1.0 — manual gate, needs the owner**

Precondition: repository secret NPM_TOKEN (granular npm token with publish rights on @yaotoshi/*) exists on onchainyaotoshi/pinokio-sdk.

~~~bash
cd ~/pinokio-sdk
npm version 0.1.0 --allow-same-version
git push --follow-tags
gh run watch --repo onchainyaotoshi/pinokio-sdk
npm view @yaotoshi/pinokio-sdk version
~~~

Expected: the workflow succeeds, the version prints 0.1.0, and the npm page shows the provenance badge.

- [ ] **Step 7: Smoke-test the published package against dev**

~~~bash
mkdir -p /tmp/pinokio-sdk-smoke && cd /tmp/pinokio-sdk-smoke
npm init -y && npm i @yaotoshi/pinokio-sdk
cat > smoke.mjs <<'SMOKE'
import { fromEnv } from "@yaotoshi/pinokio-sdk";
const pk = fromEnv();
const r = await pk.browserAutomation.gineeUnofficialAuth.login({});
console.log({ source: r.source, expiresAt: r.expiresAt, tokenLength: r.token.length });
SMOKE
PINOKIO_BASE_URL=https://pinokio.example.com PINOKIO_API_KEY=pk_REPLACE node smoke.mjs
~~~

Expected: prints source (session or login), expiresAt, and tokenLength — never the token itself. This is the only step that touches a real gateway, and it must target dev.

---

## Self-Review

**Spec coverage.** Spec "Keputusan inti" → Task 1 (packaging, public repo, provenance). Spec "Permukaan publik v1" → Task 3 (curated module) + Task 4 (/raw, with entry-surface.test enforcing that the main entry stays curated). Spec "Aturan penamaan modul" → Task 3 (modules/index.ts derivation, naming.test.ts asserting method === camel(script) against an independent implementation). Spec "Semantik protokol" → Task 2 (async-only flow, poll, result, eviction message on RUN_NOT_FOUND, deadlines, explicit dryRun). Spec "Taxonomi error" → Task 2 (error.ts, mapHttpError, assertSettled). Spec "Pertumbuhan" → Task 5 CLAUDE.md checklist plus MODULE_SPECS as the single registration point. Spec "Non-goals" → no cache, no getToken, no data endpoints anywhere. Spec "Pengujian" → unit tests in Tasks 2–4; live smoke is the manual Task 5 Step 7. Spec "Item terbuka" (whether the CDP dryRun interceptor actually blocks page.request) is a documentation caveat, recorded in Task 5 Step 3, not an implementation task.

**Placeholder scan.** No TBD, no TODO, no "similar to Task N": every step carries its file path, command, or code. The only deferred artifact is the README prose in Task 5 Step 2, which is specified section by section because prose cannot be test-verified; every other artifact is given verbatim.

**Type consistency.** TransportConfig and RunSnapshot are defined once in Task 2 and reused verbatim. executeScript<T> always returns { result, snapshot }. runScript overloads map dryRun: true to DryRunReport and dryRun: false to T. TRANSPORT is defined once in src/internal.ts using Symbol.for and consumed by client.ts and raw.ts. PinokioSdkError's Symbol.hasInstance brand is what makes instanceof work across dist/index.js and dist/raw.js.

---

## Implementation notes (deviations recorded during execution)

1. **Package lint profile.** `lint:pub` runs `attw --pack --profile node16`, not bare `attw --pack`.
   The `./raw` subpath cannot resolve under the node10 algorithm (subpath exports are not a node10
   concept) and `engines.node` is `>=18`, so the node10 column is ignored deliberately.
2. **`GineeLoginParams` is a type alias, not an interface.** Interfaces are not assignable to
   `Record<string, unknown>` in TypeScript, and `executeScript` takes `Record<string, unknown>`.
3. **Task 1 shipped a placeholder `src/raw.ts`.** Both export-map entries must exist before
   `publint`/`attw` can pass, so the `./raw` bundle is stubbed in Task 1 and replaced in Task 4.
   The Task 1 smoke test asserted that placeholder and is deleted in Task 3.
4. **Local installs need `--include=dev`.** This host's `~/.npmrc` sets `omit=dev`, which makes a plain
   `npm install` skip every devDependency. CI is unaffected.
5. **GitHub Actions:** private-repo minutes are exhausted on this account (every run in the private
   `pinokio` repo fails in ~3s with zero steps), but public repos are unaffected — the SDK repo's CI
   is green, so `publish.yml` with provenance remains the plan.

