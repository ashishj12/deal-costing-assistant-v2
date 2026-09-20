import { ChangeEntry, ChangeSet, ScopeModel } from "./entities";
import { ArtifactMeta } from "./artifacts";

/** A mutation is expressed as a pure function so history is always derivable. */
export type Mutation = (draft: ScopeModel) => ScopeModel;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

type Indexable = Record<string, unknown>;

function indexById(rows: readonly Indexable[]): Map<string, Indexable> {
  const map = new Map<string, Indexable>();
  for (const row of rows) {
    const id = row["id"];
    if (typeof id === "string") map.set(id, row);
  }
  return map;
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

const COLLECTIONS = [
  "requirements",
  "assumptions",
  "questions",
  "risks",
  "capabilities",
  "scopeItems",
] as const;

function diffCollection(
  kind: string,
  before: readonly Indexable[],
  after: readonly Indexable[],
): ChangeEntry[] {
  const entries: ChangeEntry[] = [];
  const beforeIndex = indexById(before);
  const afterIndex = indexById(after);

  for (const [id, row] of afterIndex) {
    const prior = beforeIndex.get(id);
    if (!prior) {
      entries.push({
        entityId: id,
        entityKind: kind,
        field: "*",
        before: "",
        after: stringify(row),
        operation: "created",
      });
      continue;
    }
    for (const key of Object.keys(row)) {
      const b = stringify(prior[key]);
      const a = stringify(row[key]);
      if (b !== a) {
        entries.push({
          entityId: id,
          entityKind: kind,
          field: key,
          before: b,
          after: a,
          operation: "updated",
        });
      }
    }
  }

  for (const [id, row] of beforeIndex) {
    if (!afterIndex.has(id)) {
      entries.push({
        entityId: id,
        entityKind: kind,
        field: "*",
        before: stringify(row),
        after: "",
        operation: "deleted",
      });
    }
  }
  return entries;
}

function diffConfiguration(
  before: ScopeModel,
  after: ScopeModel,
): ChangeEntry[] {
  const entries: ChangeEntry[] = [];
  const b = before.configuration as unknown as Indexable;
  const a = after.configuration as unknown as Indexable;
  for (const key of Object.keys(a)) {
    if (stringify(b[key]) !== stringify(a[key])) {
      entries.push({
        entityId: "configuration",
        entityKind: "configuration",
        field: key,
        before: stringify(b[key]),
        after: stringify(a[key]),
        operation: "updated",
      });
    }
  }
  return entries;
}

export function diffModels(
  before: ScopeModel,
  after: ScopeModel,
): ChangeEntry[] {
  const entries: ChangeEntry[] = [];
  for (const collection of COLLECTIONS) {
    entries.push(
      ...diffCollection(
        collection,
        before[collection] as unknown as Indexable[],
        after[collection] as unknown as Indexable[],
      ),
    );
  }
  entries.push(...diffConfiguration(before, after));
  return entries;
}

export interface CommitResult {
  readonly model: ScopeModel;
  readonly changeSet: ChangeSet;
}

/**
 * Applies a mutation and produces version n+1 with a derived change set.
 * The previous version is never mutated: callers keep the old object.
 */
export function commit(
  current: ScopeModel,
  summary: string,
  mutate: Mutation,
  author = "reviewer",
  now: () => string = () => new Date().toISOString(),
): CommitResult {
  const draft = mutate(clone(current));
  const entries = diffModels(current, draft);
  const nextVersion = current.version + 1;

  const touchedEntityIds = [...new Set(entries.map((e) => e.entityId))];
  const touchedFieldPaths = [
    ...new Set(entries.map((e) => `${e.entityKind}.${e.field}`)),
  ];

  const changeSet: ChangeSet = {
    version: nextVersion,
    previousVersion: current.version,
    at: now(),
    author,
    summary,
    entries,
    touchedEntityIds,
    touchedFieldPaths,
  };

  const retired = [
    ...current.retiredIds,
    ...entries.filter((e) => e.operation === "deleted").map((e) => e.entityId),
  ];

  const model: ScopeModel = {
    ...draft,
    version: nextVersion,
    updatedAt: changeSet.at,
    retiredIds: [...new Set(retired)],
    history: [...current.history, changeSet],
  };

  // Stamp lastModifiedInVersion on every requirement the change set touched.
  const touched = new Set(
    entries
      .filter((e) => e.entityKind === "requirements")
      .map((e) => e.entityId),
  );
  model.requirements = model.requirements.map((r) =>
    touched.has(r.id) ? { ...r, lastModifiedInVersion: nextVersion } : r,
  );

  return { model, changeSet };
}

/**
 * An artifact is stale only when the change set actually reaches it. This is
 * what makes "preserve unaffected content" mechanical: with no intersection
 * and no impact rule, the artifact is confirmed current at the new version.
 */
export function isArtifactStale(
  artifact: ArtifactMeta,
  changeSet: ChangeSet,
  ruleAffectedKinds: readonly string[] = [],
): boolean {
  if (ruleAffectedKinds.includes(artifact.kind)) return true;
  const touched = new Set(changeSet.touchedEntityIds);
  return (
    artifact.requirementIds.some((id) => touched.has(id)) ||
    artifact.assumptionIds.some((id) => touched.has(id))
  );
}
