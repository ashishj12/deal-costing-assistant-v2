import { ScopeModel, ScopeModelSchema } from "../domain/entities";
import { ArtifactKind } from "../domain/artifacts";

export interface StoredArtifacts {
  readonly [kind: string]: unknown;
}

export interface Workspace {
  readonly model: ScopeModel;
  readonly artifacts: Record<string, unknown>;
}

export interface ScopeRepository {
  load(): Promise<Workspace | null>;
  save(workspace: Workspace): Promise<void>;
  clear(): Promise<void>;
}

export function validateWorkspace(raw: unknown): Workspace | null {
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = raw as { model?: unknown; artifacts?: unknown };
  const parsed = ScopeModelSchema.safeParse(candidate.model);
  if (!parsed.ok) return null;
  const artifacts =
    typeof candidate.artifacts === "object" && candidate.artifacts !== null
      ? (candidate.artifacts as Record<string, unknown>)
      : {};
  return { model: parsed.value, artifacts };
}

export class InMemoryRepository implements ScopeRepository {
  private workspace: Workspace | null = null;

  async load(): Promise<Workspace | null> {
    return this.workspace
      ? (JSON.parse(JSON.stringify(this.workspace)) as Workspace)
      : null;
  }

  async save(workspace: Workspace): Promise<void> {
    this.workspace = JSON.parse(JSON.stringify(workspace)) as Workspace;
  }

  async clear(): Promise<void> {
    this.workspace = null;
  }
}

/** Browser-backed store. Reads are validated, so corrupt state fails closed. */
export class BrowserStorageRepository implements ScopeRepository {
  constructor(private readonly key = "deal-scoping-workspace") {}

  async load(): Promise<Workspace | null> {
    try {
      const raw = globalThis.localStorage?.getItem(this.key);
      if (!raw) return null;
      return validateWorkspace(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async save(workspace: Workspace): Promise<void> {
    try {
      globalThis.localStorage?.setItem(this.key, JSON.stringify(workspace));
    } catch {
      // Storage quota or a disabled store is not a reason to lose the session;
      // the in-memory model remains authoritative for this tab.
    }
  }

  async clear(): Promise<void> {
    try {
      globalThis.localStorage?.removeItem(this.key);
    } catch {
      // ignore
    }
  }
}

export const ARTIFACT_STORAGE_KEYS: readonly ArtifactKind[] = [
  "prd",
  "functional-scope",
  "architecture",
  "data-strategy",
  "integration-architecture",
  "ai-strategy",
  "estimate",
];
