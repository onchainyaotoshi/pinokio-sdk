import { TRANSPORT } from "./internal.js";
import type { Pinokio } from "./client.js";
import { executeScript, startRun, waitForRun } from "./transport.js";
import type { RunLogLine, TransportConfig, WouldExecuteEntry } from "./types.js";

export interface RawRunOptions {
  /** Required. The gateway defaults this to true, so the SDK never guesses. */
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

/**
 * Run any Pinokio script by id. The curated main entry deliberately does not
 * export this — importing it from "./raw" is an explicit opt-in.
 *
 * With `dryRun: true` the run returns a DryRunReport (what would have been sent)
 * instead of the script result, so a dry run can never be mistaken for a real one.
 */
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
  const runOptions =
    options.confirmWrite !== undefined
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
