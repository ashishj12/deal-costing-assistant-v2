import { ScopeModel } from "./entities";
import { ArtifactMeta } from "./artifacts";

export type ViolationSeverity = "blocking" | "warning";

export interface Violation {
  readonly code: string;
  readonly severity: ViolationSeverity;
  readonly message: string;
  readonly entityIds: readonly string[];
  readonly remediation: string;
}

const v = (
  code: string,
  severity: ViolationSeverity,
  message: string,
  entityIds: readonly string[],
  remediation: string,
): Violation => ({ code, severity, message, entityIds, remediation });

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dupes = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return [...dupes];
}

/**
 * The single referential-integrity pass. The quality gate renders this
 * output directly rather than reimplementing the same checks, so the two
 * can never disagree.
 */
export function validateScopeModel(
  model: ScopeModel,
  artifacts: readonly ArtifactMeta[] = [],
): Violation[] {
  const violations: Violation[] = [];
  const reqIds = new Set(model.requirements.map((r) => r.id));
  const questionIds = new Set(model.questions.map((q) => q.id));
  const scopeItemIds = new Set(model.scopeItems.map((i) => i.id));
  const capabilityIds = new Set(model.capabilities.map((c) => c.id));
  const sourceIds = new Set(model.sources.map((d) => d.id));

  for (const dup of duplicates(model.requirements.map((r) => r.id))) {
    violations.push(
      v(
        "DUP-REQ-ID",
        "blocking",
        `Requirement identifier ${dup} is used more than once.`,
        [dup],
        "Reassign one of the duplicates to a newly allocated identifier.",
      ),
    );
  }

  for (const requirement of model.requirements) {
    for (const dep of requirement.dependencies) {
      if (!reqIds.has(dep)) {
        violations.push(
          v(
            "DANGLING-REQ-DEP",
            "blocking",
            `${requirement.id} depends on ${dep}, which no longer exists.`,
            [requirement.id, dep],
            "Remove the dependency or restore the referenced requirement.",
          ),
        );
      }
    }
    for (const q of requirement.openQuestionIds) {
      if (!questionIds.has(q)) {
        violations.push(
          v(
            "DANGLING-QUESTION-REF",
            "warning",
            `${requirement.id} references question ${q}, which no longer exists.`,
            [requirement.id, q],
            "Clear the stale question reference on the requirement.",
          ),
        );
      }
    }
    if (
      requirement.sourceSpan &&
      !sourceIds.has(requirement.sourceSpan.sourceId)
    ) {
      violations.push(
        v(
          "DANGLING-SOURCE-REF",
          "blocking",
          `${requirement.id} cites source ${requirement.sourceSpan.sourceId}, which is not in the model.`,
          [requirement.id],
          "Re-ingest the source document or downgrade the requirement to inferred.",
        ),
      );
    }
    if (
      requirement.provenance === "customer-stated" &&
      !requirement.citationResolved
    ) {
      violations.push(
        v(
          "UNRESOLVED-CITATION",
          "warning",
          `${requirement.id} is marked customer-stated but its citation did not resolve.`,
          [requirement.id],
          "Open the source panel and confirm the quoted text, or reclassify as inferred.",
        ),
      );
    }
  }

  for (const item of model.scopeItems) {
    if (!capabilityIds.has(item.capabilityId)) {
      violations.push(
        v(
          "DANGLING-CAPABILITY-REF",
          "blocking",
          `${item.id} belongs to capability ${item.capabilityId}, which does not exist.`,
          [item.id],
          "Reassign the scope item to an existing capability.",
        ),
      );
    }
    for (const req of item.requirementIds) {
      if (!reqIds.has(req)) {
        violations.push(
          v(
            "SCOPE-ITEM-ORPHAN-REF",
            "blocking",
            `${item.id} covers ${req}, which has been removed.`,
            [item.id, req],
            "Regenerate the functional scope or repair the reference.",
          ),
        );
      }
    }
    for (const dep of item.dependencies) {
      if (!scopeItemIds.has(dep)) {
        violations.push(
          v(
            "DANGLING-SCOPE-DEP",
            "warning",
            `${item.id} depends on ${dep}, which does not exist.`,
            [item.id, dep],
            "Remove the dependency or restore the scope item.",
          ),
        );
      }
    }
  }

  for (const assumption of model.assumptions) {
    for (const req of assumption.affectedRequirementIds) {
      if (!reqIds.has(req)) {
        violations.push(
          v(
            "ASSUMPTION-ORPHAN-REF",
            "warning",
            `${assumption.id} affects ${req}, which has been removed.`,
            [assumption.id, req],
            "Retire the assumption or repoint it at a live requirement.",
          ),
        );
      }
    }
  }

  for (const question of model.questions) {
    for (const req of question.relatedRequirementIds) {
      if (!reqIds.has(req)) {
        violations.push(
          v(
            "QUESTION-ORPHAN-REF",
            "warning",
            `${question.id} relates to ${req}, which has been removed.`,
            [question.id, req],
            "Close the question or repoint it.",
          ),
        );
      }
    }
    if (question.resolved && question.answer.trim().length === 0) {
      violations.push(
        v(
          "EMPTY-ANSWER",
          "warning",
          `${question.id} is marked resolved with no recorded answer.`,
          [question.id],
          "Record the answer so it carries into the package.",
        ),
      );
    }
  }

  if (
    model.approval.scopeApproved &&
    model.approval.approvedAtVersion !== null
  ) {
    const drifted = model.requirements.filter(
      (r) =>
        r.status === "approved" &&
        r.lastModifiedInVersion > (model.approval.approvedAtVersion as number),
    );
    if (drifted.length > 0) {
      violations.push(
        v(
          "APPROVED-SCOPE-DRIFT",
          "blocking",
          `${drifted.length} approved requirement(s) changed after the scope model was approved.`,
          drifted.map((r) => r.id),
          "Re-approve the scope model so downstream artifacts pin a consistent version.",
        ),
      );
    }
    const rejectedButScoped = model.scopeItems.filter((item) =>
      item.requirementIds.some(
        (id) =>
          model.requirements.find((r) => r.id === id)?.status === "rejected",
      ),
    );
    if (rejectedButScoped.length > 0) {
      violations.push(
        v(
          "REJECTED-IN-SCOPE",
          "blocking",
          `${rejectedButScoped.length} scope item(s) still cover rejected requirements.`,
          rejectedButScoped.map((i) => i.id),
          "Regenerate the functional scope, or restore the rejected requirements.",
        ),
      );
    }
  }

  for (const artifact of artifacts) {
    if (artifact.scopeModelVersion > model.version) {
      violations.push(
        v(
          "ARTIFACT-VERSION-AHEAD",
          "blocking",
          `${artifact.artifactId} is pinned to version ${artifact.scopeModelVersion}, ahead of the model at ${model.version}.`,
          [artifact.artifactId],
          "Regenerate the artifact against the current scope model.",
        ),
      );
    }
    for (const req of artifact.requirementIds) {
      if (!reqIds.has(req)) {
        violations.push(
          v(
            "ARTIFACT-ORPHAN-REF",
            "blocking",
            `${artifact.artifactId} references ${req}, which has been removed.`,
            [artifact.artifactId, req],
            "Regenerate the artifact so its references are repaired.",
          ),
        );
      }
    }
  }

  const productivity = model.configuration.productivityFactor;
  if (!(productivity > 0)) {
    violations.push(
      v(
        "INVALID-PRODUCTIVITY",
        "blocking",
        "Productivity factor must be greater than zero.",
        ["configuration.productivityFactor"],
        "Set a productivity factor between 0.5 and 1.5 on the estimation screen.",
      ),
    );
  }
  if (model.configuration.contingency < 0) {
    violations.push(
      v(
        "INVALID-CONTINGENCY",
        "blocking",
        "Contingency cannot be negative.",
        ["configuration.contingency"],
        "Set contingency to zero or a positive percentage.",
      ),
    );
  }

  return violations;
}

export function hasBlocking(violations: readonly Violation[]): boolean {
  return violations.some((x) => x.severity === "blocking");
}
