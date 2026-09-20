import { describe, it, expect } from "vitest";
import { Store } from "../src/ui/state";
import { MockProvider } from "../src/ai/mock-provider";
import { InMemoryRepository } from "../src/data/repository";
import { SCENARIOS, ScenarioId } from "../src/data/scenarios";
import { renderPackageMarkdown } from "../src/export/markdown";
import { PACKAGE_DISCLAIMER } from "../src/export/package-model";
import { runConsistencyChecks } from "../src/engines/consistency";
import { seedModel } from "../src/data/seed";
import { ArchitectureArtifact } from "../src/domain/artifacts";

async function runFullFlow(id: ScenarioId): Promise<Store> {
  const store = new Store(new MockProvider(), new InMemoryRepository());
  store.loadSeed(id);
  expect(await store.extract()).toBe(true);
  const model = store.state.model;
  return Object.assign(store, { __model: model });
}

async function completeFlow(store: Store, resolveQuestions: boolean): Promise<void> {
  for (const q of store.state.model.questions) {
    if (resolveQuestions || q.blocking) {
      store.resolveQuestion(q.id, "Confirmed with the customer.");
    }
  }
  store.bulkSetStatus(
    store.state.model.requirements.map((r) => r.id),
    "approved",
  );
  store.approveScope();
  expect(await store.generateScope()).toBe(true);
  const cloud = store.state.model.configuration.cloud;
  expect(await store.generateArchitecture(cloud ?? "recommend")).toBe(true);
  expect(await store.generateSolutionDesign()).toBe(true);
  expect(await store.generateWorkstreams()).toBe(true);
}

describe("seed scenarios (mock AI mode, offline)", () => {
  it("ships the four required scenario shapes", () => {
    expect(SCENARIOS.length).toBe(4);
    const shapes = SCENARIOS.map((s) => s.shape).join("|");
    expect(shapes).toContain("modernisation");
    expect(shapes).toContain("integration");
    expect(shapes).toContain("AI-enabled");
    expect(shapes).toContain("missing");
  });

  for (const scenario of SCENARIOS) {
    it(`${scenario.id}: extracts traceable requirements`, async () => {
      const store = await runFullFlow(scenario.id);
      const reqs = store.state.model.requirements;
      expect(reqs.length).toBeGreaterThan(4);
      for (const r of reqs.filter((x) => x.provenance === "customer-stated")) {
        expect(r.sourceSpan === null).toBe(false);
        expect(r.citationResolved).toBe(true);
      }
    });

    it(`${scenario.id}: generates a full package with the disclaimer`, async () => {
      const store = await runFullFlow(scenario.id);
      await completeFlow(store, true);
      const pkg = store.packageModel();
      expect(pkg.estimate === null).toBe(false);
      const md = renderPackageMarkdown(pkg);
      expect(md).toContain(PACKAGE_DISCLAIMER);
      const cloudConflict = pkg.quality.checks.filter(
        (c) => c.checkId === "QG-CLOUD-CONFLICT",
      );
      expect(cloudConflict.length).toBe(0);
    });
  }

  it("the missing-information scenario surfaces gaps and lowers confidence", async () => {
    const store = await runFullFlow("brightwave-missing-info");
    expect(store.state.model.questions.length).toBeGreaterThan(0);
    await completeFlow(store, false);
    const pkg = store.packageModel();
    const ids = pkg.quality.checks.map((c) => c.checkId);
    expect(ids).toContain("QG-ESTIMATE-INPUTS-MISSING");
    expect(pkg.estimate?.confidence.label === "high").toBe(false);
    expect(pkg.quality.status === "READY").toBe(false);
  });

  it("the AI scenario produces AI use cases with human review and evaluation", async () => {
    const store = await runFullFlow("meridian-ai");
    await completeFlow(store, true);
    const ai = store.state.artifacts.aiStrategy;
    expect(ai === null).toBe(false);
    expect((ai?.useCases.length ?? 0)).toBeGreaterThan(0);
    for (const u of ai?.useCases ?? []) {
      expect(u.humanReview.length).toBeGreaterThan(0);
      expect(u.evaluation.length).toBeGreaterThan(0);
    }
  });
});

describe("cross-document consistency checks", () => {
  const baseArch = (): ArchitectureArtifact => ({
    meta: {
      artifactId: "ART-architecture-v1",
      kind: "architecture",
      scopeModelVersion: 1,
      requirementIds: [],
      assumptionIds: [],
      generatedAt: "2026-01-01T00:00:00Z",
      generatedBy: "mock",
      promptVersion: "v1",
      status: "in-review",
      stale: false,
      staleReason: "",
    },
    cloud: "aws",
    summary: "Test architecture summary.",
    components: [
      {
        id: "CMP-001",
        name: "Object storage",
        layer: "data",
        cloudService: "Azure Blob Storage",
        purpose: "Stores documents for the platform.",
        rationale: "Needed for document storage here.",
        tradeoffs: [],
        risks: [],
        securityNotes: "",
        scalabilityNotes: "",
        deploymentNotes: "",
        requirementIds: [],
        dependsOn: [],
        provenance: "ai-recommendation",
      },
    ],
    edges: [],
    crossCuttingConcerns: [],
  });

  it("flags unjustified components and a cross-cloud service", () => {
    const model = { ...seedModel(), configuration: { ...seedModel().configuration, cloud: "aws" as const } };
    const checks = runConsistencyChecks(model, {
      architecture: baseArch(),
      integrations: null,
      aiStrategy: null,
      workstreams: null,
      estimate: null,
    });
    const ids = checks.map((c) => c.checkId);
    expect(ids).toContain("QG-ARCH-UNJUSTIFIED");
    expect(ids).toContain("QG-CLOUD-CONFLICT");
  });

  it("flags a configured cloud that differs from the architecture", () => {
    const model = { ...seedModel(), configuration: { ...seedModel().configuration, cloud: "gcp" as const } };
    const arch = baseArch();
    const checks = runConsistencyChecks(model, {
      architecture: arch,
      integrations: null,
      aiStrategy: null,
      workstreams: null,
      estimate: null,
    });
    expect(checks.map((c) => c.checkId)).toContain("QG-CLOUD-CONFLICT");
  });

  it("reports missing estimation inputs explicitly", () => {
    const base = seedModel();
    const model = { ...base, configuration: { ...base.configuration, targetDeadlineWeeks: null, expectedUsers: 0 } };
    const checks = runConsistencyChecks(model, {
      architecture: null,
      integrations: null,
      aiStrategy: null,
      workstreams: null,
      estimate: null,
    });
    const found = checks.find((c) => c.checkId === "QG-ESTIMATE-INPUTS-MISSING");
    expect(found === undefined).toBe(false);
    expect(found?.title).toContain("target deadline");
    expect(found?.title).toContain("expected user volume");
  });
});
