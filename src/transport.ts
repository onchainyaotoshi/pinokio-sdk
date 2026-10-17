import { PinokioSdkError } from "./error.js";
import type { RunOptions, RunSnapshot, TerminalStatus, TransportConfig } from "./types.js";

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_INTERVAL_MS = 1_500;
const DEFAULT_DEADLINE_MS = 300_000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Parse "<archetype>/<workspace>/<script>" — the exact shape the gateway accepts. */
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
  const base = serverCode ? { status, serverCode } : { status };

  if (status === 401) {
    return new PinokioSdkError("AUTH_ERROR", "Pinokio rejected the API key: " + serverMessage, base);
  }
  if (status === 404 && serverCode === "ScriptNotFound") {
    return new PinokioSdkError("SCRIPT_NOT_FOUND", serverMessage, base);
  }
  if (status === 404 && serverCode === "RunNotFound") {
    return new PinokioSdkError(
      "RUN_NOT_FOUND",
      serverMessage +
        ". Run results are evicted about 5 minutes after the run settles — fetch the result as soon as the run finishes.",
      base,
    );
  }
  return new PinokioSdkError("API_ERROR", serverMessage, base);
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

/** Kick off a run. The gateway always returns { status: "started", runId }. */
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

/** Start, poll to a terminal status, then fetch the result once. */
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
