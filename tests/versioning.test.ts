import { describe, it, expect } from "vitest";
import { commit, diffModels, isArtifactStale } from "../src/domain/versioning";
import { seedModel } from "../src/data/seed";
import { ScopeModel } from "../src/domain/entities";
import { ArtifactMeta } from "../src/domain/artifacts";

function withRequirement(model: ScopeModel): ScopeModel {
  return {
    ...model,
    requirements: [
      {
        id: "REQ-001",
        type: "functional",
        description:
          "Carriers must be able to self-register without contacting operations.",
        priority: "must",
        provenance: "ai-inferred",
        sourceSpan: null,
        citationResolved: false,
        dependencies: [],
        openQuestionIds: [],
        status: "in-review",
        confidence: 0.8,
        rationale: "",
        introducedInVersion: 0,
        lastModifiedInVersion: 0,
      },
      {
        id: "REQ-002",
        type: "data",
        description:
          "Reporting data should be exported nightly to the analytics environment.",
        priority: "should",
        provenance: "ai-inferred",
        sourceSpan: null,
        citationResolved: false,
        dependencies: [],
        openQuestionIds: [],
        status: "in-review",
        confidence: 0.7,
        rationale: "",
        introducedInVersion: 0,
        lastModifiedInVersion: 0,
      },
    ],
  };
}

const meta = (
  kind: ArtifactMeta["kind"],
  requirementIds: string[],
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

describe("versioning", () => {
  it("increments the version and never mutates the previous model", () => {
    const before = withRequirement(seedModel());
    const { model } = commit(before, "edit", (draft) => {
      draft.requirements[0]!.priority = "should";
      return draft;
    });
    expect(model.version).toBe(before.version + 1);
    expect(before.requirements[0]!.priority).toBe("must");
    expect(model.requirements[0]!.priority).toBe("should");
  });

  it("derives a field-level change set", () => {
    const before = withRequirement(seedModel());
    const { changeSet } = commit(before, "edit", (draft) => {
      draft.requirements[0]!.description =
        "Carriers must self-register and upload compliance documents.";
      return draft;
    });
    expect(changeSet.entries.length).toBe(1);
    expect(changeSet.entries[0]!.field).toBe("description");
    expect(changeSet.touchedEntityIds).toContain("REQ-001");
    expect(changeSet.touchedFieldPaths).toContain("requirements.description");
  });

  it("records deletions and retires the identifier", () => {
    const before = withRequirement(seedModel());
    const { model, changeSet } = commit(before, "delete", (draft) => {
      draft.requirements = draft.requirements.filter((r) => r.id !== "REQ-002");
      return draft;
    });
    expect(changeSet.entries.some((e) => e.operation === "deleted")).toBe(true);
    expect(model.retiredIds).toContain("REQ-002");
  });

  it("preserves unaffected content: an artifact touching nothing changed is not stale", () => {
    const before = withRequirement(seedModel());
    const { changeSet } = commit(before, "edit REQ-001", (draft) => {
      draft.requirements[0]!.description =
        "Updated description for the self-registration requirement.";
      return draft;
    });
    const touched = meta("prd", ["REQ-001"]);
    const untouched = meta("ai-strategy", ["REQ-002"]);
    expect(isArtifactStale(touched, changeSet)).toBe(true);
    expect(isArtifactStale(untouched, changeSet)).toBe(false);
  });

  it("stamps lastModifiedInVersion only on touched requirements", () => {
    const before = withRequirement(seedModel());
    const { model } = commit(before, "edit", (draft) => {
      draft.requirements[0]!.priority = "could";
      return draft;
    });
    expect(model.requirements[0]!.lastModifiedInVersion).toBe(model.version);
    expect(model.requirements[1]!.lastModifiedInVersion).toBe(0);
  });

  it("produces an empty diff for an identical model", () => {
    const model = withRequirement(seedModel());
    expect(diffModels(model, model)).toHaveLength(0);
  });
});
