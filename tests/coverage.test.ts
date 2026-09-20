import { describe, it, expect } from "vitest";
import {
  computeCoverage,
  mandatoryCoverageRatio,
} from "../src/engines/coverage";
import { seedModel } from "../src/data/seed";
import { ScopeModel, Requirement, ScopeItem } from "../src/domain/entities";

const req = (
  id: string,
  overrides: Partial<Requirement> = {},
): Requirement => ({
  id,
  type: "functional",
  description:
    "The platform must deliver the capability described by the customer.",
  priority: "must",
  provenance: "customer-stated",
  sourceSpan: { sourceId: "SRC-001", start: 0, end: 8, quote: "Northwind" },
  citationResolved: true,
  dependencies: [],
  openQuestionIds: [],
  status: "approved",
  confidence: 0.9,
  rationale: "",
  introducedInVersion: 1,
  lastModifiedInVersion: 1,
  ...overrides,
});

const item = (
  id: string,
  requirementIds: string[],
  overrides: Partial<ScopeItem> = {},
): ScopeItem => ({
  id,
  capabilityId: "CAP-001",
  name: `Scope ${id}`,
  description: "Delivers the linked requirements.",
  requirementIds,
  priority: "must",
  dependencies: [],
  provenance: "ai-recommendation",
  status: "in-review",
  ...overrides,
});

function model(
  requirements: Requirement[],
  scopeItems: ScopeItem[],
): ScopeModel {
  return {
    ...seedModel(),
    requirements,
    scopeItems,
    capabilities: [
      {
        id: "CAP-001",
        name: "Core",
        summary: "",
        requirementIds: [],
        provenance: "ai-recommendation",
      },
    ],
  };
}

describe("coverage", () => {
  it("marks a requirement with no scope item as uncovered", () => {
    const report = computeCoverage(model([req("REQ-001")], []));
    expect(report.uncovered).toBe(1);
    expect(report.rows[0]!.state).toBe("uncovered");
  });

  it("marks coverage by an unapproved assistant-derived item as weak", () => {
    const report = computeCoverage(
      model([req("REQ-001")], [item("SCP-001", ["REQ-001"])]),
    );
    expect(report.weak).toBe(1);
    expect(report.rows[0]!.state).toBe("weakly-covered");
  });

  it("marks coverage by an approved item as covered", () => {
    const report = computeCoverage(
      model(
        [req("REQ-001")],
        [item("SCP-001", ["REQ-001"], { status: "approved" })],
      ),
    );
    expect(report.covered).toBe(1);
    expect(report.ratio).toBe(1);
  });

  it("never infers coverage from wording similarity", () => {
    const requirement = req("REQ-001", {
      description: "Carrier self registration must be available.",
    });
    const unlinked = item("SCP-001", ["REQ-999"], { status: "approved" });
    const report = computeCoverage(model([requirement], [unlinked]));
    expect(report.rows[0]!.state).toBe("uncovered");
  });

  it("excludes rejected and out-of-scope requirements from the denominator", () => {
    const report = computeCoverage(
      model(
        [
          req("REQ-001"),
          req("REQ-002", { status: "rejected" }),
          req("REQ-003", { provenance: "out-of-scope" }),
          req("REQ-004", { priority: "wont" }),
        ],
        [],
      ),
    );
    expect(report.inScopeTotal).toBe(1);
  });

  it("reports scope items that cover no live requirement", () => {
    const report = computeCoverage(
      model([req("REQ-001")], [item("SCP-009", ["REQ-404"])]),
    );
    expect(report.unsupportedAdditions).toContain("SCP-009");
  });

  it("computes mandatory coverage over must and should only", () => {
    const m = model(
      [
        req("REQ-001", { priority: "must" }),
        req("REQ-002", { priority: "could" }),
      ],
      [item("SCP-001", ["REQ-001"], { status: "approved" })],
    );
    expect(mandatoryCoverageRatio(m)).toBe(1);
  });
});
