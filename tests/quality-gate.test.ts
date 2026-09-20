import { describe, it, expect } from "vitest";
import { runQualityGate } from "../src/engines/quality-gate";
import { validateScopeModel } from "../src/domain/validate";
import { seedModel } from "../src/data/seed";
import { ScopeModel, Requirement } from "../src/domain/entities";

function ready(): ScopeModel {
  const model = seedModel();
  const requirement: Requirement = {
    id: "REQ-001",
    type: "functional",
    description: "Carriers must be able to self-register on the portal.",
    priority: "must",
    provenance: "customer-stated",
    sourceSpan: { sourceId: "SRC-001", start: 0, end: 9, quote: "Northwind" },
    citationResolved: true,
    dependencies: [],
    openQuestionIds: [],
    status: "approved",
    confidence: 0.9,
    rationale: "",
    introducedInVersion: 1,
    lastModifiedInVersion: 1,
  };
  return {
    ...model,
    version: 2,
    requirements: [requirement],
    capabilities: [
      {
        id: "CAP-001",
        name: "Portal",
        summary: "",
        requirementIds: ["REQ-001"],
        provenance: "ai-recommendation",
      },
    ],
    scopeItems: [
      {
        id: "SCP-001",
        capabilityId: "CAP-001",
        name: "Self registration",
        description: "Delivers carrier self-registration.",
        requirementIds: ["REQ-001"],
        priority: "must",
        dependencies: [],
        provenance: "customer-stated",
        status: "approved",
      },
    ],
    questions: [],
    assumptions: [],
    approval: {
      scopeApproved: true,
      approvedAtVersion: 2,
      approvedAt: new Date().toISOString(),
      approvedBy: "reviewer",
    },
  };
}

const metas = (
  ["prd", "functional-scope", "architecture", "estimate"] as const
).map((kind) => ({
  artifactId: `ART-${kind}-v2`,
  kind,
  scopeModelVersion: 2,
  requirementIds: ["REQ-001"],
  assumptionIds: [],
  generatedAt: new Date().toISOString(),
  generatedBy: "mock" as const,
  promptVersion: "v1",
  status: "approved" as const,
  stale: false,
  staleReason: "",
}));

describe("quality gate", () => {
  it("returns READY when everything is in place", () => {
    const report = runQualityGate(ready(), metas);
    expect(report.status).toBe("READY");
    expect(report.blocking).toBe(0);
  });

  it("BLOCKS when the scope model is not approved", () => {
    const model = ready();
    model.approval = {
      scopeApproved: false,
      approvedAtVersion: null,
      approvedAt: null,
      approvedBy: null,
    };
    const report = runQualityGate(model, metas);
    expect(report.status).toBe("BLOCKED");
    expect(
      report.checks.some((c) => c.checkId === "QG-SCOPE-NOT-APPROVED"),
    ).toBe(true);
  });

  it("BLOCKS on an unresolved blocking question", () => {
    const model = ready();
    model.questions = [
      {
        id: "QST-001",
        text: "What is the expected user volume?",
        relatedRequirementIds: [],
        severity: "blocking",
        category: "scale",
        blocking: true,
        resolved: false,
        answer: "",
        source: "ai-proposed",
      },
    ];
    const report = runQualityGate(model, metas);
    expect(report.status).toBe("BLOCKED");
  });

  it("BLOCKS on an uncovered in-scope requirement", () => {
    const model = ready();
    model.scopeItems = [];
    const report = runQualityGate(model, metas);
    expect(
      report.checks.some((c) => c.checkId === "QG-UNCOVERED-REQUIREMENTS"),
    ).toBe(true);
    expect(report.status).toBe("BLOCKED");
  });

  it("returns REVIEW_REQUIRED for warnings alone", () => {
    const model = ready();
    model.assumptions = [
      {
        id: "ASM-001",
        text: "The customer provides test data within two weeks of kickoff.",
        rationale: "",
        affectedRequirementIds: [],
        needsValidation: true,
        status: "in-review",
        owner: "Unassigned",
        source: "ai-proposed",
        introducedInVersion: 1,
      },
    ];
    const report = runQualityGate(model, metas);
    expect(report.status).toBe("REVIEW_REQUIRED");
    expect(report.blocking).toBe(0);
  });

  it("every check states what to do about it", () => {
    const model = ready();
    model.scopeItems = [];
    model.approval = {
      scopeApproved: false,
      approvedAtVersion: null,
      approvedAt: null,
      approvedBy: null,
    };
    for (const check of runQualityGate(model, []).checks) {
      if (check.severity === "pass") continue;
      expect(check.recommendedAction.length).toBeGreaterThan(5);
      expect(check.route.startsWith("#/")).toBe(true);
    }
  });
});

describe("referential validation", () => {
  it("detects a dangling requirement dependency", () => {
    const model = ready();
    model.requirements[0]!.dependencies = ["REQ-404"];
    const violations = validateScopeModel(model, []);
    expect(violations.some((v) => v.code === "DANGLING-REQ-DEP")).toBe(true);
  });

  it("detects a scope item referencing a removed requirement", () => {
    const model = ready();
    model.scopeItems[0]!.requirementIds = ["REQ-404"];
    const violations = validateScopeModel(model, []);
    expect(violations.some((v) => v.code === "SCOPE-ITEM-ORPHAN-REF")).toBe(
      true,
    );
  });

  it("detects approved scope drift", () => {
    const model = ready();
    model.requirements[0]!.lastModifiedInVersion = 9;
    const violations = validateScopeModel(model, []);
    expect(violations.some((v) => v.code === "APPROVED-SCOPE-DRIFT")).toBe(
      true,
    );
  });

  it("detects an artifact pinned ahead of the model", () => {
    const model = ready();
    const violations = validateScopeModel(model, [
      { ...metas[0]!, scopeModelVersion: 99 },
    ]);
    expect(violations.some((v) => v.code === "ARTIFACT-VERSION-AHEAD")).toBe(
      true,
    );
  });

  it("flags a customer-stated requirement whose citation did not resolve", () => {
    const model = ready();
    model.requirements[0]!.citationResolved = false;
    const violations = validateScopeModel(model, []);
    expect(violations.some((v) => v.code === "UNRESOLVED-CITATION")).toBe(true);
  });
});
