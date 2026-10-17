import type { TransportConfig } from "../types.js";
import { isExpired, login, type GineeLoginParams } from "./browser-automation/ginee-unofficial-auth.js";

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

/**
 * The single list of scripts exposed on the curated client. Adding a workspace
 * module means adding an entry here plus a manifest fixture — nothing else.
 */
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
