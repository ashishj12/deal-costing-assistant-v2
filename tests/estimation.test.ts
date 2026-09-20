import { describe, it, expect } from "vitest";
import {
  computeConfidence,
  computeEstimate,
  computeTimeline,
  integrationFactor,
} from "../src/engines/estimation";
import { BASE_UNITS } from "../src/engines/rates";
import { seedModel } from "../src/data/seed";
import { ScopeModel } from "../src/domain/entities";
import { WorkstreamProposal } from "../src/domain/artifacts";

function baseModel(): ScopeModel {
  const model = seedModel();
  return {
    ...model,
    configuration: {
      ...model.configuration,
      cloud: "azure",
      externalSystemCount: 0,
      complianceTier: "standard",
      dataComplexity: "low",
      productivityFactor: 1,
      contingency: 0,
      currency: "USD",
      teamCapacity: 1,
      targetDeadlineWeeks: null,
    },
  };
}

const ws = (
  overrides: Partial<WorkstreamProposal> = {},
): WorkstreamProposal => ({
  id: "WS-001",
  name: "Build",
  description: "",
  band: "M",
  bandRationale: "Sized from the requirement count.",
  drivers: [],
  requirementIds: ["REQ-001"],
  dependencies: [],
  roleMix: { engineer: 1 },
  priority: "must",
  ...overrides,
});

describe("estimation", () => {
  it("is deterministic: identical input produces identical output", () => {
    const model = baseModel();
    const a = computeEstimate(model, [ws()]);
    const b = computeEstimate(model, [ws()]);
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(a.value.totals).toEqual(b.value.totals);
  });

  it("applies the neutral factor set as an identity", () => {
    const result = computeEstimate(baseModel(), [ws({ band: "M" })]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.workstreams[0]!.adjustedHours).toBe(BASE_UNITS.M);
    }
  });

  it("multiplies factors in the documented order", () => {
    const model = baseModel();
    model.configuration.externalSystemCount = 5; // 1 + 5*0.08 = 1.40
    model.configuration.complianceTier = "regulated"; // 1.15
    model.configuration.dataComplexity = "high"; // 1.45
    model.configuration.productivityFactor = 1.25; // divisor
    const result = computeEstimate(model, [ws({ band: "L" })]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const expected = (BASE_UNITS.L * 1.4 * 1.15 * 1.45) / 1.25;
      expect(result.value.workstreams[0]!.adjustedHours).toBeCloseTo(
        Math.round(expected * 10) / 10,
        1,
      );
    }
  });

  it("caps the integration factor", () => {
    expect(integrationFactor(0)).toBe(1);
    expect(integrationFactor(5)).toBeCloseTo(1.4, 5);
    expect(integrationFactor(100)).toBe(2);
  });

  it("rejects a role mix that does not sum to one", () => {
    const result = computeEstimate(baseModel(), [
      ws({ roleMix: { engineer: 0.5, qa: 0.2 } }),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toContain("roleMix");
  });

  it("rejects an unknown role rather than silently pricing it at zero", () => {
    const result = computeEstimate(baseModel(), [
      ws({ roleMix: { wizard: 1 } }),
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects a zero productivity factor instead of dividing by zero", () => {
    const model = baseModel();
    model.configuration.productivityFactor = 0;
    const result = computeEstimate(model, [ws()]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe("productivityFactor");
  });

  it("refuses to estimate with no workstreams", () => {
    expect(computeEstimate(baseModel(), []).ok).toBe(false);
  });

  it("applies contingency to the ROM and not to the effort", () => {
    const model = baseModel();
    model.configuration.contingency = 0.25;
    const result = computeEstimate(model, [ws()]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.totals.midHours).toBe(BASE_UNITS.M);
      expect(result.value.totals.romLow).toBe(
        Math.round(result.value.totals.costLow * 1.25),
      );
    }
  });

  it("honours a rate override", () => {
    const withDefault = computeEstimate(baseModel(), [ws()]);
    const withOverride = computeEstimate(baseModel(), [ws()], { engineer: 1 });
    expect(withDefault.ok && withOverride.ok).toBe(true);
    if (withDefault.ok && withOverride.ok) {
      expect(withOverride.value.totals.costLow).toBeLessThan(
        withDefault.value.totals.costLow,
      );
      expect(withOverride.value.totals.midHours).toBe(
        withDefault.value.totals.midHours,
      );
    }
  });

  it("produces a stable ROM snapshot for the seeded configuration", () => {
    const model = baseModel();
    model.configuration.externalSystemCount = 2;
    model.configuration.complianceTier = "regulated";
    model.configuration.dataComplexity = "high";
    model.configuration.contingency = 0.2;
    const result = computeEstimate(model, [
      ws({
        id: "WS-001",
        band: "M",
        roleMix: { "solution-architect": 0.5, "project-manager": 0.5 },
      }),
      ws({
        id: "WS-002",
        band: "L",
        dependencies: ["WS-001"],
        roleMix: { engineer: 0.7, qa: 0.3 },
      }),
    ]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // 120 * 1.16 * 1.15 * 1.45 = 232.1 ; 320 * ... = 619.0
      expect(result.value.workstreams[0]!.adjustedHours).toBeCloseTo(232.1, 1);
      expect(result.value.workstreams[1]!.adjustedHours).toBeCloseTo(619, 0);
      expect(result.value.totals.midHours).toBeCloseTo(851.1, 1);
    }
  });
});

describe("timeline", () => {
  const estimateFor = (
    model: ScopeModel,
    workstreams: WorkstreamProposal[],
  ) => {
    const result = computeEstimate(model, workstreams);
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  };

  it("follows the critical path, not the total hours", () => {
    const model = baseModel();
    model.configuration.teamCapacity = 20;
    const chained = estimateFor(model, [
      ws({ id: "WS-001", band: "M" }),
      ws({ id: "WS-002", band: "M", dependencies: ["WS-001"] }),
      ws({ id: "WS-003", band: "M", dependencies: ["WS-002"] }),
    ]);
    const parallel = estimateFor(model, [
      ws({ id: "WS-001", band: "M" }),
      ws({ id: "WS-002", band: "M" }),
      ws({ id: "WS-003", band: "M" }),
    ]);
    expect(chained.totals.midHours).toBe(parallel.totals.midHours);
    expect(chained.timeline.weeksHigh).toBeGreaterThan(
      parallel.timeline.weeksHigh,
    );
    expect(chained.timeline.criticalPathIds).toEqual([
      "WS-001",
      "WS-002",
      "WS-003",
    ]);
  });

  it("detects a dependency cycle instead of hanging", () => {
    const model = baseModel();
    const result = computeEstimate(model, [
      ws({ id: "WS-001", dependencies: ["WS-002"] }),
      ws({ id: "WS-002", dependencies: ["WS-001"] }),
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("cycle");
  });

  it("flags a deadline conflict", () => {
    const model = baseModel();
    model.configuration.targetDeadlineWeeks = 1;
    const estimate = estimateFor(model, [ws({ band: "XL" })]);
    expect(estimate.timeline.deadlineConflict).toBe(true);
  });

  it("rejects a capacity below one person", () => {
    const result = computeTimeline([], 0, null);
    expect(result.ok).toBe(false);
  });
});

describe("confidence", () => {
  it("scores an empty model at zero grounding", () => {
    const model = seedModel();
    const confidence = computeConfidence(model);
    expect(confidence.grounding).toBe(0);
    expect(confidence.label).toBe("low");
  });

  it("weights the four inputs to the documented total", () => {
    const model = seedModel();
    model.requirements = [
      {
        id: "REQ-001",
        type: "functional",
        description: "Carriers must be able to self-register on the portal.",
        priority: "must",
        provenance: "customer-stated",
        sourceSpan: {
          sourceId: "SRC-001",
          start: 0,
          end: 10,
          quote: "Carriers",
        },
        citationResolved: true,
        dependencies: [],
        openQuestionIds: [],
        status: "approved",
        confidence: 1,
        rationale: "",
        introducedInVersion: 1,
        lastModifiedInVersion: 1,
      },
    ];
    model.capabilities = [
      {
        id: "CAP-001",
        name: "Portal",
        summary: "",
        requirementIds: ["REQ-001"],
        provenance: "ai-recommendation",
      },
    ];
    model.scopeItems = [
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
    ];
    const confidence = computeConfidence(model);
    expect(confidence.grounding).toBe(1);
    expect(confidence.coverage).toBe(1);
    expect(confidence.score).toBe(1);
    expect(confidence.label).toBe("high");
  });
});
