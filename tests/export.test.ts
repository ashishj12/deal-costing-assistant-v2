import { describe, it, expect } from "vitest";
import { renderPackageMarkdown, renderMermaid } from "../src/export/markdown";
import {
  PACKAGE_DISCLAIMER,
  packageSections,
  PackageModel,
} from "../src/export/package-model";
import { buildPrd, buildFunctionalScope } from "../src/engines/prd";
import { computeCoverage } from "../src/engines/coverage";
import { runQualityGate } from "../src/engines/quality-gate";
import { seedModel } from "../src/data/seed";
import { ScopeModel } from "../src/domain/entities";

function populated(): ScopeModel {
  const model = seedModel();
  return {
    ...model,
    version: 3,
    requirements: [
      {
        id: "REQ-001",
        type: "functional",
        description: "Carriers must be able to self-register on the portal.",
        priority: "must",
        provenance: "customer-stated",
        sourceSpan: {
          sourceId: "SRC-001",
          start: 0,
          end: 9,
          quote: "Northwind",
        },
        citationResolved: true,
        dependencies: [],
        openQuestionIds: [],
        status: "approved",
        confidence: 0.9,
        rationale: "",
        introducedInVersion: 1,
        lastModifiedInVersion: 1,
      },
    ],
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
    approval: {
      scopeApproved: true,
      approvedAtVersion: 3,
      approvedAt: new Date().toISOString(),
      approvedBy: "reviewer",
    },
  };
}

function pkg(model: ScopeModel): PackageModel {
  return {
    generatedAt: new Date().toISOString(),
    model,
    prd: buildPrd(model),
    functionalScope: buildFunctionalScope(model),
    architecture: null,
    dataStrategy: null,
    integrations: null,
    aiStrategy: null,
    estimate: null,
    coverage: computeCoverage(model),
    quality: runQualityGate(model, []),
    lastImpact: null,
    disclaimer: PACKAGE_DISCLAIMER,
  };
}

describe("package export", () => {
  it("carries the required disclaimer verbatim", () => {
    const markdown = renderPackageMarkdown(pkg(populated()));
    expect(markdown).toContain(PACKAGE_DISCLAIMER);
    expect(PACKAGE_DISCLAIMER).toContain(
      "not a final quote, contractual commitment, or delivery guarantee",
    );
  });

  it("stamps a blocked package with its validation status", () => {
    const model = populated();
    const markdown = renderPackageMarkdown(pkg(model));
    expect(markdown).toContain("Validation status");
    expect(markdown).toContain("must not be treated as validated");
  });

  it("labels requirement origin in the export", () => {
    const markdown = renderPackageMarkdown(pkg(populated()));
    expect(markdown).toContain("Customer");
    expect(markdown).toContain("REQ-001");
  });

  it("includes coverage and traceability sections", () => {
    const markdown = renderPackageMarkdown(pkg(populated()));
    expect(markdown).toContain("## Requirement coverage");
    expect(markdown).toContain("## Traceability");
  });

  it("does not fabricate an estimate section when none exists", () => {
    const markdown = renderPackageMarkdown(pkg(populated()));
    expect(markdown).not.toContain("## Effort, timeline and ROM");
  });

  it("reports missing sections honestly in the readiness list", () => {
    const sections = packageSections(pkg(populated()));
    const architecture = sections.find((s) => s.key === "architecture");
    expect(architecture!.present).toBe(false);
    expect(architecture!.note).toContain("Not generated");
  });

  it("renders an explicit placeholder when there is no architecture graph", () => {
    expect(renderMermaid(pkg(populated()))).toContain(
      "No architecture generated",
    );
  });

  it("escapes pipe characters so tables cannot be broken by content", () => {
    const model = populated();
    model.requirements[0]!.description =
      "A | B | C must be supported by the platform.";
    const markdown = renderPackageMarkdown(pkg(model));
    expect(markdown).toContain("A \\| B \\| C");
  });
});

describe("deterministic PRD", () => {
  it("names the requirements each section derives from", () => {
    const prd = buildPrd(populated());
    const functional = prd.sections.find((s) => s.id === "functional");
    expect(functional!.requirementIds).toContain("REQ-001");
  });

  it("states honestly when objectives are missing", () => {
    const model = populated();
    model.customer.businessObjectives = [];
    const prd = buildPrd(model);
    expect(prd.sections[0]!.body).toContain(
      "No business objectives were stated",
    );
  });
});
