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

/**
 * The single error class thrown by this SDK. Discriminate on `code`.
 *
 * `instanceof` works across the two published bundles (index and raw) because
 * the brand is registered on the global symbol registry.
 */
export class PinokioSdkError extends Error {
  readonly code: PinokioErrorCode;
  readonly status?: number;
  readonly serverCode?: string;
  readonly runId?: string;
  readonly cause?: unknown;
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

  /** True across bundle boundaries, where a plain instanceof would fail. */
  static override [Symbol.hasInstance](value: unknown): boolean {
    return (
      typeof value === "object" &&
      value !== null &&
      (value as Record<symbol, unknown>)[BRAND] === true
    );
  }
}
