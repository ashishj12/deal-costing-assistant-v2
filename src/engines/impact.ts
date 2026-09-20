import { ChangeSet, ScopeModel } from "../domain/entities";
import {
  ARTIFACT_LABEL,
  ArtifactKind,
  ArtifactMeta,
} from "../domain/artifacts";
import { IMPACT_RULES, ImpactRule, ImpactSeverity } from "./impact-rules";
import { CONCURRENCY_TIER_USERS } from "./rates";

export interface FiredRule {
  readonly rule: ImpactRule;
  readonly field: string;
  readonly before: string;
  readonly after: string;
}

export interface AffectedArtifact {
  readonly kind: ArtifactKind;
  readonly label: string;
  readonly severity: ImpactSeverity;
  readonly reasons: readonly string[];
  readonly ruleIds: readonly string[];
  readonly triggeredByRequirementIds: readonly string[];
}

export interface ConfirmedCurrent {
  readonly kind: ArtifactKind;
  readonly label: string;
  readonly reason: string;
}

export interface ImpactAnalysis {
  readonly changeSet: ChangeSet;
  readonly firedRules: readonly FiredRule[];
  readonly affected: readonly AffectedArtifact[];
  readonly confirmedCurrent: readonly ConfirmedCurrent[];
  readonly affectedAssumptionIds: readonly string[];
}

const SEVERITY_ORDER: Record<ImpactSeverity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};

const TIER_ORDER = Object.keys(CONCURRENCY_TIER_USERS);

function directionOf(
  field: string,
  before: string,
  after: string,
): "increase" | "decrease" | "same" {
  if (field === "concurrencyTier") {
    const b = TIER_ORDER.indexOf(before);
    const a = TIER_ORDER.indexOf(after);
    return a > b ? "increase" : a < b ? "decrease" : "same";
  }
  const b = Number(before);
  const a = Number(after);
  if (Number.isFinite(b) && Number.isFinite(a)) {
    return a > b ? "increase" : a < b ? "decrease" : "same";
  }
  return before === after ? "same" : "increase";
}

/**
 * Determines what a change actually reaches. Restraint is the point: an
 * artifact with no intersecting reference and no firing rule is reported as
 * confirmed current, not regenerated.
 */
export function analyseImpact(
  model: ScopeModel,
  changeSet: ChangeSet,
  artifacts: readonly ArtifactMeta[],
): ImpactAnalysis {
  const fired: FiredRule[] = [];

  for (const entry of changeSet.entries) {
    const path = `${entry.entityKind}.${entry.field}`;
    for (const rule of IMPACT_RULES) {
      if (rule.trigger !== path) continue;
      if (rule.direction !== "any") {
        const dir = directionOf(entry.field, entry.before, entry.after);
        if (dir !== rule.direction) continue;
      }
      fired.push({
        rule,
        field: path,
        before: entry.before,
        after: entry.after,
      });
    }
  }

  const touchedRequirementIds = new Set(
    changeSet.entries
      .filter((e) => e.entityKind === "requirements")
      .map((e) => e.entityId),
  );

  const byKind = new Map<ArtifactKind, AffectedArtifact>();
  const affectedAssumptionIds = new Set<string>();

  for (const f of fired) {
    if (f.rule.affects === "assumptions") {
      for (const assumption of model.assumptions) {
        if (/user|volume|concurren|scale|load/i.test(assumption.text)) {
          affectedAssumptionIds.add(assumption.id);
        }
      }
      continue;
    }
    const kind = f.rule.affects;
    const existing = byKind.get(kind);
    const reason = `${f.rule.scope}: ${f.rule.reason}`;
    if (!existing) {
      byKind.set(kind, {
        kind,
        label: ARTIFACT_LABEL[kind],
        severity: f.rule.severity,
        reasons: [reason],
        ruleIds: [f.rule.id],
        triggeredByRequirementIds: [...touchedRequirementIds],
      });
    } else {
      byKind.set(kind, {
        ...existing,
        severity:
          SEVERITY_ORDER[f.rule.severity] > SEVERITY_ORDER[existing.severity]
            ? f.rule.severity
            : existing.severity,
        reasons: [...existing.reasons, reason],
        ruleIds: [...existing.ruleIds, f.rule.id],
      });
    }
  }

  // Direct reference intersection, independent of the rule table.
  for (const artifact of artifacts) {
    const hits = artifact.requirementIds.filter((id) =>
      touchedRequirementIds.has(id),
    );
    if (hits.length === 0) continue;
    const existing = byKind.get(artifact.kind);
    const reason = `References changed requirement(s): ${hits.join(", ")}.`;
    if (!existing) {
      byKind.set(artifact.kind, {
        kind: artifact.kind,
        label: ARTIFACT_LABEL[artifact.kind],
        severity: "high",
        reasons: [reason],
        ruleIds: ["REF-INTERSECT"],
        triggeredByRequirementIds: hits,
      });
    } else {
      byKind.set(artifact.kind, {
        ...existing,
        reasons: [...existing.reasons, reason],
        ruleIds: [...existing.ruleIds, "REF-INTERSECT"],
        triggeredByRequirementIds: hits,
      });
    }
  }

  const confirmedCurrent: ConfirmedCurrent[] = artifacts
    .filter((a) => !byKind.has(a.kind))
    .map((a) => ({
      kind: a.kind,
      label: ARTIFACT_LABEL[a.kind],
      reason: `No impact rule fired and no referenced requirement changed. Confirmed current at version ${changeSet.version}.`,
    }));

  const affected = [...byKind.values()].sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity],
  );

  return {
    changeSet,
    firedRules: fired,
    affected,
    confirmedCurrent,
    affectedAssumptionIds: [...affectedAssumptionIds],
  };
}
