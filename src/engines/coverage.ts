import { ScopeModel, Requirement } from "../domain/entities";

export type CoverageState = "covered" | "weakly-covered" | "uncovered";

export interface RequirementCoverage {
  readonly requirementId: string;
  readonly state: CoverageState;
  readonly scopeItemIds: readonly string[];
  readonly reason: string;
}

export interface CoverageReport {
  readonly rows: readonly RequirementCoverage[];
  readonly covered: number;
  readonly weak: number;
  readonly uncovered: number;
  readonly inScopeTotal: number;
  readonly ratio: number;
  /** Scope items that cover nothing the customer asked for. */
  readonly unsupportedAdditions: readonly string[];
}

function inScope(requirement: Requirement): boolean {
  return (
    requirement.status !== "rejected" &&
    requirement.provenance !== "out-of-scope" &&
    requirement.priority !== "wont"
  );
}

export function computeCoverage(model: ScopeModel): CoverageReport {
  const rows: RequirementCoverage[] = [];
  const scoped = model.requirements.filter(inScope);

  for (const requirement of scoped) {
    const items = model.scopeItems.filter((i) =>
      i.requirementIds.includes(requirement.id),
    );
    if (items.length === 0) {
      rows.push({
        requirementId: requirement.id,
        state: "uncovered",
        scopeItemIds: [],
        reason: "No scope item declares this requirement.",
      });
      continue;
    }
    const strong = items.filter(
      (i) => i.status === "approved" || i.provenance === "customer-stated",
    );
    if (strong.length === 0) {
      rows.push({
        requirementId: requirement.id,
        state: "weakly-covered",
        scopeItemIds: items.map((i) => i.id),
        reason:
          "Covered only by unapproved, assistant-derived scope items. Confirm before relying on this coverage.",
      });
    } else {
      rows.push({
        requirementId: requirement.id,
        state: "covered",
        scopeItemIds: strong.map((i) => i.id),
        reason: "Covered by an approved or customer-traceable scope item.",
      });
    }
  }

  const liveRequirementIds = new Set(scoped.map((r) => r.id));
  const unsupportedAdditions = model.scopeItems
    .filter(
      (item) => !item.requirementIds.some((id) => liveRequirementIds.has(id)),
    )
    .map((item) => item.id);

  const covered = rows.filter((r) => r.state === "covered").length;
  const weak = rows.filter((r) => r.state === "weakly-covered").length;
  const uncovered = rows.filter((r) => r.state === "uncovered").length;

  return {
    rows,
    covered,
    weak,
    uncovered,
    inScopeTotal: rows.length,
    ratio: rows.length === 0 ? 0 : covered / rows.length,
    unsupportedAdditions,
  };
}

/** Coverage restricted to the priorities a commercial reviewer cares about. */
export function mandatoryCoverageRatio(model: ScopeModel): number {
  const report = computeCoverage(model);
  const mandatoryIds = new Set(
    model.requirements
      .filter(
        (r) => inScope(r) && (r.priority === "must" || r.priority === "should"),
      )
      .map((r) => r.id),
  );
  const rows = report.rows.filter((r) => mandatoryIds.has(r.requirementId));
  if (rows.length === 0) return 0;
  return rows.filter((r) => r.state === "covered").length / rows.length;
}
