import { executeScript } from "../../transport.js";
import type { TransportConfig } from "../../types.js";

const WORKSPACE = "browser-automation/ginee-unofficial-auth";

export type GineeLoginParams = {
  /** Force a fresh sign-in even when the gateway browser session is still valid. */
  forceLogin?: boolean;
  /** Force a fresh sign-in when the session token has at most this many seconds left. */
  minRemainingSeconds?: number;
};

export interface GineeLoginResult {
  token: string;
  tokenType: "Bearer";
  expiresAt: string | null;
  /** "session" reuses the gateway browser session; "login" performed a fresh sign-in. */
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
