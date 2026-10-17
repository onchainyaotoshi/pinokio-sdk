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
    throw new PinokioSdkError(
      "MISSING_CONFIG",
      "createPinokio requires a base URL (PINOKIO_BASE_URL).",
    );
  }
  if (typeof config.apiKey !== "string" || config.apiKey.trim() === "") {
    throw new PinokioSdkError(
      "MISSING_CONFIG",
      "createPinokio requires an API key (PINOKIO_API_KEY), created at <base URL>/apikeys.",
    );
  }

  const cfg: TransportConfig = {
    baseUrl: config.baseUrl.trim().replace(/\/+$/, ""),
    apiKey: config.apiKey.trim(),
  };
  if (config.requestTimeoutMs !== undefined) cfg.requestTimeoutMs = config.requestTimeoutMs;
  if (config.pollIntervalMs !== undefined) cfg.pollIntervalMs = config.pollIntervalMs;
  if (config.deadlineMs !== undefined) cfg.deadlineMs = config.deadlineMs;

  const client = buildModules(cfg) as unknown as Pinokio;
  Object.defineProperty(client, TRANSPORT, { value: cfg, enumerable: false, writable: false });
  return client;
}

/** Build a client from PINOKIO_BASE_URL and PINOKIO_API_KEY. */
export function fromEnv(env: NodeJS.ProcessEnv = process.env): Pinokio {
  const baseUrl = env.PINOKIO_BASE_URL;
  const apiKey = env.PINOKIO_API_KEY;
  if (!baseUrl) {
    throw new PinokioSdkError(
      "MISSING_CONFIG",
      "PINOKIO_BASE_URL is not set (e.g. https://pinokio.example.com).",
    );
  }
  if (!apiKey) {
    throw new PinokioSdkError(
      "MISSING_CONFIG",
      "PINOKIO_API_KEY is not set — create one at <base URL>/apikeys.",
    );
  }
  return createPinokio({ baseUrl, apiKey });
}
