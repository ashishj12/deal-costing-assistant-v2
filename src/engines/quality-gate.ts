import { ScopeModel } from "../domain/entities";
import {
  ARTIFACT_LABEL,
  ArtifactKind,
  ArtifactMeta,
} from "../domain/artifacts";
import { validateScopeModel, Violation } from "../domain/validate";
import { computeCoverage } from "./coverage";
import { ConsistencyInput, runConsistencyChecks } from "./consistency";

export type GateStatus = "READY" | "REVIEW_REQUIRED" | "BLOCKED";
export type CheckSeverity = "blocking" | "warning" | "pass";

export interface QualityCheck {
  readonly checkId: string;
  readonly title: string;
  readonly severity: CheckSeverity;
  readonly description: string;
  readonly relatedIds: readonly string[];
  readonly whyItMatters: string;
  readonly recommendedAction: string;
  readonly route: string;
}

export interface QualityReport {
  readonly status: GateStatus;
  readonly checks: readonly QualityCheck[];
  readonly blocking: number;
  readonly warnings: number;
  readonly passed: number;
}

function fromViolation(violation: Violation): QualityCheck {
  return {
    checkId: violation.code,
    title: violation.message,
    severity: violation.severity,
    description: violation.message,
    relatedIds: violation.entityIds,
    whyItMatters:
      violation.severity === "blocking"
        ? "The package cannot be exported as validated while this reference is broken."
        : "This weakens traceability in the exported package.",
    recommendedAction: violation.remediation,
    route: "#/requirements",
  };
}

/**
 * The gate renders the referential validator's output plus a small number of
 * readiness checks. It deliberately does not reimplement any check that
 * validateScopeModel already performs.
 */
export function runQualityGate(
  model: ScopeModel,
  artifacts: readonly ArtifactMeta[],
  content?: ConsistencyInput,
): QualityReport {
  const checks: QualityCheck[] = validateScopeModel(model, artifacts).map(
    fromViolation,
  );

  const coverage = computeCoverage(model);

  if (model.requirements.length === 0) {
    checks.push({
      checkId: "QG-NO-REQUIREMENTS",
      title: "No requirements have been captured",
      severity: "blocking",
      description:
        "The scope model contains no requirements, so nothing downstream can be generated.",
      relatedIds: [],
      whyItMatters: "Every artifact derives from requirements.",
      recommendedAction:
        "Add customer material on the intake screen and extract requirements.",
      route: "#/intake",
    });
  }

  if (!model.approval.scopeApproved) {
    checks.push({
      checkId: "QG-SCOPE-NOT-APPROVED",
      title: "Scope model is not approved",
      severity: "blocking",
      description:
        "Downstream artifacts cannot be treated as validated until the scope model is approved.",
      relatedIds: [],
      whyItMatters:
        "Approval is what separates a draft from a reviewable deliverable.",
      recommendedAction:
        "Resolve blocking questions and approve the scope model.",
      route: "#/requirements",
    });
  }

  const unresolvedBlocking = model.questions.filter(
    (q) => q.blocking && !q.resolved,
  );
  if (unresolvedBlocking.length > 0) {
    checks.push({
      checkId: "QG-BLOCKING-QUESTIONS",
      title: `${unresolvedBlocking.length} blocking clarification question(s) are unresolved`,
      severity: "blocking",
      description:
        "Questions marked blocking must be answered or explicitly acknowledged as an assumption.",
      relatedIds: unresolvedBlocking.map((q) => q.id),
      whyItMatters:
        "An unanswered blocking question means the estimate rests on an unstated guess.",
      recommendedAction:
        "Answer each question, or convert it into an owned assumption.",
      route: "#/requirements",
    });
  }

  const uncovered = coverage.rows.filter((r) => r.state === "uncovered");
  if (uncovered.length > 0) {
    checks.push({
      checkId: "QG-UNCOVERED-REQUIREMENTS",
      title: `${uncovered.length} in-scope requirement(s) are not covered by any scope item`,
      severity: "blocking",
      description:
        "Requirements with no covering scope item will not be delivered and are not estimated.",
      relatedIds: uncovered.map((r) => r.requirementId),
      whyItMatters:
        "Uncovered must-have requirements are the most common source of scope disputes after signature.",
      recommendedAction:
        "Regenerate the functional scope, or move the requirement out of scope explicitly.",
      route: "#/scope",
    });
  }

  const weak = coverage.rows.filter((r) => r.state === "weakly-covered");
  if (weak.length > 0) {
    checks.push({
      checkId: "QG-WEAK-COVERAGE",
      title: `${weak.length} requirement(s) are covered only by unapproved, assistant-derived scope`,
      severity: "warning",
      description:
        "Coverage exists but rests on scope items nobody has confirmed.",
      relatedIds: weak.map((r) => r.requirementId),
      whyItMatters:
        "Weak coverage reads as coverage in an exported package unless it is flagged.",
      recommendedAction: "Review and approve the covering scope items.",
      route: "#/scope",
    });
  }

  if (coverage.unsupportedAdditions.length > 0) {
    checks.push({
      checkId: "QG-UNSUPPORTED-ADDITIONS",
      title: `${coverage.unsupportedAdditions.length} scope item(s) cover no live requirement`,
      severity: "warning",
      description:
        "These items add delivery effort that no customer requirement justifies.",
      relatedIds: coverage.unsupportedAdditions,
      whyItMatters:
        "Unsupported additions inflate the ROM without a traceable reason.",
      recommendedAction:
        "Link the item to a requirement, or remove it from scope.",
      route: "#/scope",
    });
  }

  const unvalidated = model.assumptions.filter(
    (a) => a.needsValidation && a.status !== "approved",
  );
  if (unvalidated.length > 0) {
    checks.push({
      checkId: "QG-UNVALIDATED-ASSUMPTIONS",
      title: `${unvalidated.length} assumption(s) still need validation`,
      severity: "warning",
      description:
        "Unvalidated assumptions lower estimate confidence and carry into the package as risk.",
      relatedIds: unvalidated.map((a) => a.id),
      whyItMatters: "An assumption nobody owns is an unpriced dependency.",
      recommendedAction:
        "Assign an owner and approve, or raise it as a clarification question.",
      route: "#/requirements",
    });
  }

  const stale = artifacts.filter((a) => a.stale);
  if (stale.length > 0) {
    checks.push({
      checkId: "QG-STALE-ARTIFACTS",
      title: `${stale.length} artifact(s) are stale relative to the current scope version`,
      severity: "warning",
      description: stale
        .map((a) => `${ARTIFACT_LABEL[a.kind]} (${a.staleReason})`)
        .join("; "),
      relatedIds: stale.map((a) => a.artifactId),
      whyItMatters:
        "A stale artifact describes a scope version that no longer exists.",
      recommendedAction:
        "Review the change and regenerate the affected artifacts.",
      route: "#/changes",
    });
  }

  const missing: ArtifactKind[] = (
    ["prd", "functional-scope", "architecture", "estimate"] as ArtifactKind[]
  ).filter((kind) => !artifacts.some((a) => a.kind === kind));
  if (missing.length > 0) {
    checks.push({
      checkId: "QG-MISSING-ARTIFACTS",
      title: `${missing.length} core artifact(s) have not been generated`,
      severity: "blocking",
      description: missing.map((k) => ARTIFACT_LABEL[k]).join(", "),
      relatedIds: missing,
      whyItMatters:
        "The package cannot be assembled without its core sections.",
      recommendedAction: "Generate the missing artifacts from the scope model.",
      route: "#/scope",
    });
  }

  if (content) checks.push(...runConsistencyChecks(model, content));

  const passes: QualityCheck[] = [];
  const push = (checkId: string, title: string, route: string) =>
    passes.push({
      checkId,
      title,
      severity: "pass",
      description: title,
      relatedIds: [],
      whyItMatters: "",
      recommendedAction: "",
      route,
    });

  if (model.requirements.length > 0 && uncovered.length === 0) {
    push(
      "QG-COVERAGE-OK",
      "Every in-scope requirement is covered by a scope item.",
      "#/scope",
    );
  }
  if (unresolvedBlocking.length === 0 && model.questions.length > 0) {
    push(
      "QG-QUESTIONS-OK",
      "All blocking clarification questions are resolved.",
      "#/requirements",
    );
  }
  if (model.sources.length > 0) {
    push(
      "QG-SOURCES-OK",
      `${model.sources.length} source document(s) retained for traceability.`,
      "#/intake",
    );
  }

  const all = [...checks, ...passes];
  const blocking = all.filter((c) => c.severity === "blocking").length;
  const warnings = all.filter((c) => c.severity === "warning").length;
  const passed = all.filter((c) => c.severity === "pass").length;

  const status: GateStatus =
    blocking > 0 ? "BLOCKED" : warnings > 0 ? "REVIEW_REQUIRED" : "READY";

  return { status, checks: all, blocking, warnings, passed };
}

export const GATE_LABEL: Record<GateStatus, string> = {
  READY: "Ready",
  REVIEW_REQUIRED: "Review required",
  BLOCKED: "Blocked",
};
