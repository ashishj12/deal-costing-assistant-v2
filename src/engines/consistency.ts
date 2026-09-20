import { ScopeModel } from "../domain/entities";
import {
  AiStrategyArtifact,
  ArchitectureArtifact,
  IntegrationArtifact,
  WorkstreamProposal,
} from "../domain/artifacts";
import { Estimate } from "./estimation";
import type { QualityCheck } from "./quality-gate";

/** Generated content the cross-document checks compare against each other. */
export interface ConsistencyInput {
  readonly architecture: ArchitectureArtifact | null;
  readonly integrations: IntegrationArtifact | null;
  readonly aiStrategy: AiStrategyArtifact | null;
  readonly workstreams: readonly WorkstreamProposal[] | null;
  readonly estimate: Estimate | null;
}

const CLOUD_PREFIX: Record<string, RegExp> = {
  aws: /^(aws|amazon)\b/i,
  azure: /^(azure|microsoft)\b/i,
  gcp: /^(google|gcp|vertex|bigquery|cloud (run|sql|storage|armor|kms))\b/i,
};

function check(
  checkId: string,
  title: string,
  severity: "blocking" | "warning",
  description: string,
  relatedIds: readonly string[],
  whyItMatters: string,
  recommendedAction: string,
  route: string,
): QualityCheck {
  return {
    checkId,
    title,
    severity,
    description,
    relatedIds,
    whyItMatters,
    recommendedAction,
    route,
  };
}

/**
 * Cross-document consistency and justification checks. Pure and deterministic:
 * every finding is derived from identifiers and numbers already in the model
 * and artifacts, never from wording similarity.
 */
export function runConsistencyChecks(
  model: ScopeModel,
  input: ConsistencyInput,
): QualityCheck[] {
  const out: QualityCheck[] = [];
  const liveIds = new Set(
    model.requirements
      .filter((r) => r.status !== "rejected")
      .map((r) => r.id),
  );
  const { architecture, integrations, aiStrategy, workstreams, estimate } =
    input;

  // 1. Architecture components with no live requirement justification.
  if (architecture) {
    const unjustified = architecture.components.filter(
      (c) => !c.requirementIds.some((id) => liveIds.has(id)),
    );
    if (unjustified.length > 0) {
      out.push(
        check(
          "QG-ARCH-UNJUSTIFIED",
          `${unjustified.length} architecture component(s) have no requirement justification`,
          "warning",
          unjustified.map((c) => `${c.id} ${c.name}`).join("; "),
          unjustified.map((c) => c.id),
          "A component nobody asked for is unsupported cost and risk.",
          "Link each component to a requirement or remove it from the design.",
          "#/architecture",
        ),
      );
    }

    // 2. Conflicting cloud selection.
    const configured = model.configuration.cloud;
    const conflicts: string[] = [];
    if (configured && architecture.cloud !== configured) {
      conflicts.push(
        `Architecture targets ${architecture.cloud} but configuration selects ${configured}`,
      );
    }
    for (const [cloud, pattern] of Object.entries(CLOUD_PREFIX)) {
      if (cloud === architecture.cloud) continue;
      for (const c of architecture.components) {
        if (pattern.test(c.cloudService.trim())) {
          conflicts.push(
            `${c.id} uses "${c.cloudService}", a ${cloud} service, in a ${architecture.cloud} design`,
          );
        }
      }
    }
    if (conflicts.length > 0) {
      out.push(
        check(
          "QG-CLOUD-CONFLICT",
          "Conflicting cloud selection across outputs",
          "blocking",
          conflicts.join("; "),
          [],
          "Mixed platforms invalidate the architecture, the cost model and the skills plan.",
          "Align the configured cloud and regenerate the architecture.",
          "#/architecture",
        ),
      );
    }
  }

  // 3. Integrations that no delivery workstream will build.
  if (integrations && workstreams) {
    const planned = new Set(workstreams.flatMap((w) => w.requirementIds));
    const unplanned = integrations.integrations.filter(
      (i) => !i.requirementIds.some((id) => planned.has(id)),
    );
    if (unplanned.length > 0) {
      out.push(
        check(
          "QG-INTEGRATION-UNPLANNED",
          `${unplanned.length} integration(s) are missing from the delivery plan`,
          "warning",
          unplanned.map((i) => `${i.id} ${i.name}`).join("; "),
          unplanned.map((i) => i.id),
          "An integration outside every workstream is not estimated.",
          "Regenerate workstreams so each integration's requirements are planned.",
          "#/estimation",
        ),
      );
    }
  }

  // 4. AI use cases without governance content.
  if (aiStrategy) {
    const gaps: string[] = [];
    for (const u of aiStrategy.useCases) {
      if (!u.humanReview.trim()) gaps.push(`${u.id}: no human-review step`);
      if (!u.evaluation.trim()) gaps.push(`${u.id}: no evaluation approach`);
      if (u.dataRequirements.length === 0)
        gaps.push(`${u.id}: no data or privacy requirement stated`);
    }
    if (aiStrategy.useCases.length > 0 && aiStrategy.responsibleAi.length === 0)
      gaps.push("No responsible-AI or safety considerations recorded");
    if (gaps.length > 0) {
      out.push(
        check(
          "QG-AI-GOVERNANCE",
          `${gaps.length} AI governance gap(s)`,
          "warning",
          gaps.join("; "),
          aiStrategy.useCases.map((u) => u.id),
          "AI use cases without evaluation, privacy or human review are not deployable.",
          "Complete the missing AI governance fields.",
          "#/solution",
        ),
      );
    }
  }

  // 5. Missing estimation inputs (reduce confidence; never silently defaulted).
  const cfg = model.configuration;
  const missingInputs: string[] = [];
  if (cfg.targetDeadlineWeeks === null) missingInputs.push("target deadline");
  if (cfg.cloud === null) missingInputs.push("cloud platform");
  if (cfg.expectedUsers === 0) missingInputs.push("expected user volume");
  if (missingInputs.length > 0) {
    out.push(
      check(
        "QG-ESTIMATE-INPUTS-MISSING",
        `Estimation inputs missing: ${missingInputs.join(", ")}`,
        "warning",
        `The estimate cannot use ${missingInputs.join(", ")}. Affected: timeline conflict check, infrastructure and scalability sizing, performance-test effort. Confidence is reduced accordingly.`,
        [],
        "Unsupported precision would hide a real gap in the estimate.",
        "Provide the missing configuration or record an owned assumption.",
        "#/estimation",
      ),
    );
  }

  // 6. Estimate / commercial inconsistencies.
  if (estimate) {
    const problems: string[] = [];
    const t = estimate.totals;
    if (t.lowHours > t.highHours) problems.push("low hours exceed high hours");
    if (t.romLow > t.romHigh) problems.push("ROM low exceeds ROM high");
    if (t.romLow + 0.01 < t.costLow)
      problems.push("ROM low is below cost before contingency");
    if (t.currency !== cfg.currency)
      problems.push(
        `estimate currency ${t.currency} differs from configured ${cfg.currency}`,
      );
    if (t.contingency !== cfg.contingency)
      problems.push("estimate contingency differs from configuration");
    if (integrations && integrations.integrations.length !== cfg.externalSystemCount)
      problems.push(
        `configuration lists ${cfg.externalSystemCount} external system(s) but the integration design has ${integrations.integrations.length}`,
      );
    if (estimate.timeline.deadlineConflict)
      problems.push("timeline exceeds the target deadline");
    if (problems.length > 0) {
      out.push(
        check(
          "QG-ESTIMATE-INCONSISTENT",
          "Estimate or commercial inconsistency",
          "warning",
          problems.join("; "),
          [],
          "Commercial figures must reconcile with configuration and design.",
          "Update the configuration or regenerate the estimate.",
          "#/estimation",
        ),
      );
    }
  }
  return out;
}
