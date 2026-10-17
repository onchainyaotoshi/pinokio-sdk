import type { TransportConfig } from "../types.js";
import { MODULE_SPECS } from "./spec.js";

type Leaf = Record<string, unknown>;

const camel = (segment: string) => segment.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase());

/** Build the curated client surface: pk.<archetype>.<workspace>.<method>(). */
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
