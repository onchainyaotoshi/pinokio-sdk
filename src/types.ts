export type RunStatus = "running" | "succeeded" | "failed" | "timed_out" | "cancelled";
export type TerminalStatus = Exclude<RunStatus, "running">;

export interface RunLogLine {
  t: number;
  msg: string;
}

export interface WouldExecuteEntry {
  method: string;
  url: string;
}

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

export interface RunOptions {
  dryRun: boolean;
  confirmWrite?: boolean;
}
