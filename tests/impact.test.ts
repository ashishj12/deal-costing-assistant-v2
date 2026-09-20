import { describe, it, expect } from "vitest";
import { analyseImpact } from "../src/engines/impact";
import { IMPACT_RULES } from "../src/engines/impact-rules";
import { commit } from "../src/domain/versioning";
import { seedModel } from "../src/data/seed";
import { ArtifactMeta } from "../src/domain/artifacts";
import { ScopeModel } from "../src/domain/entities";

const meta = (
  kind: ArtifactMeta["kind"],
  requirementIds: string[] = [],
): ArtifactMeta => ({
  artifactId: `ART-${kind}-v1`,
  kind,
  scopeModelVersion: 1,
  requirementIds,
  assumptionIds: [],
  generatedAt: new Date().toISOString(),
  generatedBy: "mock",
  promptVersion: "v1",
  status: "in-review",
  stale: false,
  staleReason: "",
});

function withRequirements(model: ScopeModel): ScopeModel {
  return {
    ...model,
    requirements: [
      {
        id: "REQ-001",
        type: "functional",
        description:
          "Carriers must self-register through the portal without contacting operations.",
        priority: "must",
        provenance: "ai-inferred",
        sourceSpan: null,
        citationResolved: false,
        dependencies: [],
        openQuestionIds: [],
        status: "approved",
        confidence: 0.8,
        rationale: "",
        introducedInVersion: 0,
        lastModifiedInVersion: 0,
      },
      {
        id: "REQ-002",
        type: "data",
        description:
          "Reporting data should be exported nightly into the analytics environment.",
        priority: "should",
        provenance: "ai-inferred",
        sourceSpan: null,
        citationResolved: false,
        dependencies: [],
        openQuestionIds: [],
        status: "approved",
        confidence: 0.7,
        rationale: "",
        introducedInVersion: 0,
        lastModifiedInVersion: 0,
      },
    ],
  };
}

describe("impact rules", () => {
  it("every rule has a unique id and a stated reason", () => {
    const ids = IMPACT_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of IMPACT_RULES) {
      expect(rule.reason.length).toBeGreaterThan(20);
      expect(rule.scope.length).toBeGreaterThan(2);
    }
  });

  it("fires the scale rules when the concurrency tier increases", () => {
    const before = withRequirements(seedModel());
    const { model, changeSet } = commit(before, "scale up", (draft) => {
      draft.configuration.concurrencyTier = "internet-scale";
      return draft;
    });
    const analysis = analyseImpact(model, changeSet, [
      meta("architecture"),
      meta("estimate"),
    ]);
    const ruleIds = analysis.firedRules.map((f) => f.rule.id);
    expect(ruleIds).toContain("IR-SCALE-01");
    expect(ruleIds).toContain("IR-SCALE-02");
    expect(analysis.affected.some((a) => a.kind === "architecture")).toBe(true);
  });

  it("does not fire increase-only rules on a decrease", () => {
    const before = { ...withRequirements(seedModel()) };
    before.configuration.concurrencyTier = "enterprise";
    const { model, changeSet } = commit(before, "scale down", (draft) => {
      draft.configuration.concurrencyTier = "pilot";
      return draft;
    });
    const analysis = analyseImpact(model, changeSet, [meta("architecture")]);
    expect(analysis.firedRules.map((f) => f.rule.id)).not.toContain(
      "IR-SCALE-01",
    );
  });

  it("confirms an artifact as current when nothing reaches it", () => {
    const before = withRequirements(seedModel());
    const { model, changeSet } = commit(before, "edit REQ-001", (draft) => {
      draft.requirements[0]!.description =
        "Carriers must self-register and upload their compliance documents.";
      return draft;
    });
    const analysis = analyseImpact(model, changeSet, [
      meta("prd", ["REQ-001"]),
      meta("ai-strategy", ["REQ-002"]),
    ]);
    expect(analysis.affected.some((a) => a.kind === "prd")).toBe(true);
    expect(
      analysis.confirmedCurrent.some((c) => c.kind === "ai-strategy"),
    ).toBe(true);
  });

  it("flags an artifact by direct reference intersection even with no rule", () => {
    const before = withRequirements(seedModel());
    const { model, changeSet } = commit(before, "reprioritise", (draft) => {
      draft.requirements[1]!.confidence = 0.2;
      return draft;
    });
    const analysis = analyseImpact(model, changeSet, [
      meta("data-strategy", ["REQ-002"]),
    ]);
    expect(analysis.affected.some((a) => a.kind === "data-strategy")).toBe(
      true,
    );
    expect(analysis.affected[0]!.ruleIds).toContain("REF-INTERSECT");
  });

  it("treats a capacity change as affecting the timeline only", () => {
    const before = withRequirements(seedModel());
    const { model, changeSet } = commit(before, "add people", (draft) => {
      draft.configuration.teamCapacity = 20;
      return draft;
    });
    const analysis = analyseImpact(model, changeSet, [
      meta("architecture"),
      meta("prd"),
    ]);
    expect(analysis.firedRules.map((f) => f.rule.id)).toContain(
      "IR-CAPACITY-01",
    );
    expect(analysis.affected.some((a) => a.kind === "architecture")).toBe(
      false,
    );
  });

  it("flags scale-related assumptions for revalidation", () => {
    const before = withRequirements(seedModel());
    before.assumptions = [
      {
        id: "ASM-001",
        text: "Expected user volume remains within the departmental band.",
        rationale: "",
        affectedRequirementIds: [],
        needsValidation: true,
        status: "approved",
        owner: "reviewer",
        source: "ai-proposed",
        introducedInVersion: 0,
      },
    ];
    const { model, changeSet } = commit(before, "scale up", (draft) => {
      draft.configuration.concurrencyTier = "enterprise";
      return draft;
    });
    const analysis = analyseImpact(model, changeSet, []);
    expect(analysis.affectedAssumptionIds).toContain("ASM-001");
  });
});
