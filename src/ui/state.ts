import {
  Assumption,
  ClarificationQuestion,
  Cloud,
  Requirement,
  ScopeModel,
  SourceDocument,
} from "../domain/entities";
import {
  AiStrategyArtifact,
  ArchitectureArtifact,
  ArtifactKind,
  ArtifactMeta,
  DataStrategyArtifact,
  FunctionalScopeArtifact,
  IntegrationArtifact,
  PrdArtifact,
  WorkstreamProposal,
} from "../domain/artifacts";
import { commit, isArtifactStale } from "../domain/versioning";
import { nextId } from "../domain/ids";
import { AiProvider } from "../ai/provider";
import { MockProvider } from "../ai/mock-provider";
import {
  generateAiStrategy,
  generateArchitecture,
  generateDataStrategy,
  generateIntegrations,
  generateWorkstreams,
  runExtraction,
} from "../ai/pipeline";
import { buildFunctionalScope, buildPrd } from "../engines/prd";
import { computeCoverage } from "../engines/coverage";
import { computeEstimate, Estimate } from "../engines/estimation";
import { runQualityGate } from "../engines/quality-gate";
import { analyseImpact, ImpactAnalysis } from "../engines/impact";
import { concurrencyTierForUsers, Role } from "../engines/rates";
import { recommendCloud } from "../engines/cloud-catalog";
import { BrowserStorageRepository, ScopeRepository } from "../data/repository";
import { createEmptyModel, makeSource } from "../data/seed";
import { ScenarioId, scenarioModelFor } from "../data/scenarios";
import { PackageModel, PACKAGE_DISCLAIMER } from "../export/package-model";

export interface Artifacts {
  prd: PrdArtifact | null;
  functionalScope: FunctionalScopeArtifact | null;
  architecture: ArchitectureArtifact | null;
  dataStrategy: DataStrategyArtifact | null;
  integrations: IntegrationArtifact | null;
  aiStrategy: AiStrategyArtifact | null;
  workstreams: WorkstreamProposal[] | null;
}

export interface BusyState {
  readonly key: string;
  readonly label: string;
}

export interface AppState {
  model: ScopeModel;
  artifacts: Artifacts;
  workstreamsGeneratedAtVersion: number | null;
  rateOverrides: Partial<Record<Role, number>>;
  busy: BusyState | null;
  lastError: { title: string; detail: string; retryable: boolean } | null;
  lastImpact: ImpactAnalysis | null;
  pendingChange: {
    summary: string;
    apply: (model: ScopeModel) => ScopeModel;
  } | null;
  selection: Record<string, string | null>;
  injectionFindings: { sourceId: string; excerpt: string }[];
  downgraded: { id: string; reason: string }[];
  route: string;
}

type Listener = () => void;

const emptyArtifacts = (): Artifacts => ({
  prd: null,
  functionalScope: null,
  architecture: null,
  dataStrategy: null,
  integrations: null,
  aiStrategy: null,
  workstreams: null,
});

export class Store {
  private listeners: Listener[] = [];
  public state: AppState;

  constructor(
    private readonly provider: AiProvider = new MockProvider(),
    private readonly repository: ScopeRepository = new BrowserStorageRepository(),
  ) {
    this.state = {
      model: createEmptyModel(),
      artifacts: emptyArtifacts(),
      workstreamsGeneratedAtVersion: null,
      rateOverrides: {},
      busy: null,
      lastError: null,
      lastImpact: null,
      pendingChange: null,
      selection: {},
      injectionFindings: [],
      downgraded: [],
      route: "#/overview",
    };
  }

  get providerName(): string {
    return this.provider.name;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
    void this.persist();
  }

  private async persist(): Promise<void> {
    await this.repository.save({
      model: this.state.model,
      artifacts: this.state.artifacts as unknown as Record<string, unknown>,
    });
  }

  async restore(): Promise<boolean> {
    const workspace = await this.repository.load();
    if (!workspace) return false;
    this.state.model = workspace.model;
    this.state.artifacts = {
      ...emptyArtifacts(),
      ...(workspace.artifacts as unknown as Artifacts),
    };
    this.notify();
    return true;
  }

  async reset(): Promise<void> {
    await this.repository.clear();
    this.state.model = createEmptyModel();
    this.state.artifacts = emptyArtifacts();
    this.state.workstreamsGeneratedAtVersion = null;
    this.state.lastImpact = null;
    this.state.injectionFindings = [];
    this.state.downgraded = [];
    this.notify();
  }

  setRoute(route: string): void {
    this.state.route = route;
    this.notify();
  }

  select(scope: string, id: string | null): void {
    this.state.selection[scope] = id;
    this.notify();
  }

  clearError(): void {
    this.state.lastError = null;
    this.notify();
  }

  private async withBusy<T>(
    key: string,
    label: string,
    work: () => Promise<T>,
  ): Promise<T | null> {
    this.state.busy = { key, label };
    this.state.lastError = null;
    this.notify();
    try {
      return await work();
    } finally {
      this.state.busy = null;
      this.notify();
    }
  }

  private fail(title: string, detail: string, retryable: boolean): null {
    this.state.lastError = { title, detail, retryable };
    this.notify();
    return null;
  }

  // ---------- intake ----------

  loadSeed(scenarioId: ScenarioId = "northwind-modernisation"): void {
    this.state.model = scenarioModelFor(scenarioId);
    this.state.artifacts = emptyArtifacts();
    this.state.lastImpact = null;
    this.notify();
  }

  updateCustomer(patch: Partial<ScopeModel["customer"]>): void {
    this.state.model = {
      ...this.state.model,
      customer: { ...this.state.model.customer, ...patch },
    };
    this.notify();
  }

  updateProjectName(name: string): void {
    this.state.model = { ...this.state.model, projectName: name };
    this.notify();
  }

  /** Duplicate content is rejected by checksum rather than silently ingested twice. */
  addSource(
    name: string,
    kind: SourceDocument["kind"],
    content: string,
  ): { ok: boolean; message: string } {
    const trimmed = content.trim();
    if (trimmed.length === 0) {
      return {
        ok: false,
        message: "The supplied content is empty or whitespace only.",
      };
    }
    if (trimmed.length > 400_000) {
      return {
        ok: false,
        message:
          "Source exceeds the 400,000 character limit. Split it into smaller documents.",
      };
    }
    const id = nextId(
      "source",
      this.state.model.sources.map((s) => s.id),
    );
    const document = makeSource(
      id,
      name.slice(0, 200) || `Pasted text ${id}`,
      kind,
      content,
    );
    if (
      this.state.model.sources.some((s) => s.checksum === document.checksum)
    ) {
      return {
        ok: false,
        message: "This exact content has already been ingested.",
      };
    }
    this.state.model = {
      ...this.state.model,
      sources: [...this.state.model.sources, document],
    };
    this.notify();
    return {
      ok: true,
      message: `${document.name} ingested (${document.bytes.toLocaleString("en-US")} characters).`,
    };
  }

  removeSource(id: string): void {
    this.state.model = {
      ...this.state.model,
      sources: this.state.model.sources.filter((s) => s.id !== id),
    };
    this.notify();
  }

  async extract(): Promise<boolean> {
    const result = await this.withBusy(
      "extract",
      "Extracting requirements",
      async () => {
        const model = this.state.model;
        if (model.sources.length === 0) {
          return this.fail(
            "Nothing to extract",
            "Add customer material before running extraction.",
            false,
          );
        }
        const outcome = await runExtraction(
          this.provider,
          model,
          model.sources,
        );
        if (!outcome.ok) {
          return this.fail(
            "Extraction failed",
            [outcome.failure.message, ...outcome.failure.detail].join(" "),
            outcome.failure.retryable,
          );
        }

        const { model: next } = commit(
          model,
          "Extracted requirements from source material",
          (draft) => {
            draft.requirements = [
              ...draft.requirements,
              ...outcome.value.requirements,
            ];
            draft.questions = [...draft.questions, ...outcome.value.questions];
            draft.assumptions = [
              ...draft.assumptions,
              ...outcome.value.assumptions,
            ];
            draft.risks = [...draft.risks, ...outcome.value.risks];
            return draft;
          },
        );

        this.state.model = next;
        this.state.injectionFindings = [...outcome.value.injectionFindings];
        this.state.downgraded = [...outcome.value.downgraded];
        this.notify();
        return true;
      },
    );
    return result === true;
  }

  // ---------- requirement review ----------

  updateRequirement(
    id: string,
    patch: Partial<Requirement>,
    summary: string,
  ): void {
    const { model } = commit(this.state.model, summary, (draft) => {
      draft.requirements = draft.requirements.map((r) =>
        r.id === id ? { ...r, ...patch } : r,
      );
      return draft;
    });
    this.state.model = model;
    this.markStaleFrom(model);
  }

  deleteRequirement(id: string): void {
    const { model } = commit(this.state.model, `Deleted ${id}`, (draft) => {
      draft.requirements = draft.requirements.filter((r) => r.id !== id);
      draft.requirements = draft.requirements.map((r) => ({
        ...r,
        dependencies: r.dependencies.filter((d) => d !== id),
      }));
      return draft;
    });
    this.state.model = model;
    this.state.selection["requirement"] = null;
    this.markStaleFrom(model);
  }

  addRequirement(): string {
    const id = nextId(
      "requirement",
      this.state.model.requirements.map((r) => r.id),
    );
    const { model } = commit(this.state.model, `Added ${id}`, (draft) => {
      draft.requirements = [
        ...draft.requirements,
        {
          id,
          type: "functional",
          description:
            "New requirement. Replace this description with the requirement text.",
          priority: "should",
          provenance: "user-assumption",
          sourceSpan: null,
          citationResolved: false,
          dependencies: [],
          openQuestionIds: [],
          status: "draft",
          confidence: 0.5,
          rationale: "Added manually during review.",
          introducedInVersion: draft.version + 1,
          lastModifiedInVersion: draft.version + 1,
        },
      ];
      return draft;
    });
    this.state.model = model;
    this.state.selection["requirement"] = id;
    this.notify();
    return id;
  }

  resolveQuestion(id: string, answer: string): void {
    const { model } = commit(this.state.model, `Resolved ${id}`, (draft) => {
      draft.questions = draft.questions.map((q) =>
        q.id === id ? { ...q, resolved: true, answer } : q,
      );
      return draft;
    });
    this.state.model = model;
    this.notify();
  }

  updateAssumption(id: string, patch: Partial<Assumption>): void {
    const { model } = commit(this.state.model, `Updated ${id}`, (draft) => {
      draft.assumptions = draft.assumptions.map((a) =>
        a.id === id ? { ...a, ...patch } : a,
      );
      return draft;
    });
    this.state.model = model;
    this.notify();
  }

  approveScope(): { ok: boolean; reason: string } {
    const model = this.state.model;
    const blocking = model.questions.filter((q) => q.blocking && !q.resolved);
    if (blocking.length > 0) {
      return {
        ok: false,
        reason: `${blocking.length} blocking question(s) must be resolved first.`,
      };
    }
    const unreviewed = model.requirements.filter(
      (r) => r.status === "draft" || r.status === "in-review",
    );
    if (unreviewed.length > 0) {
      return {
        ok: false,
        reason: `${unreviewed.length} requirement(s) are still awaiting review.`,
      };
    }
    if (model.requirements.length === 0) {
      return { ok: false, reason: "There are no requirements to approve." };
    }
    const { model: next } = commit(
      model,
      "Approved the scope model",
      (draft) => {
        draft.approval = {
          scopeApproved: true,
          approvedAtVersion: draft.version + 1,
          approvedAt: new Date().toISOString(),
          approvedBy: "reviewer",
        };
        return draft;
      },
    );
    this.state.model = next;
    this.notify();
    return { ok: true, reason: "" };
  }

  bulkSetStatus(ids: readonly string[], status: Requirement["status"]): void {
    const { model } = commit(
      this.state.model,
      `Set ${ids.length} requirement(s) to ${status}`,
      (draft) => {
        draft.requirements = draft.requirements.map((r) =>
          ids.includes(r.id) ? { ...r, status } : r,
        );
        return draft;
      },
    );
    this.state.model = model;
    this.markStaleFrom(model);
  }

  // ---------- generation ----------

  async generateScope(): Promise<boolean> {
    const done = await this.withBusy(
      "scope",
      "Building functional scope",
      async () => {
        const model = this.state.model;
        if (!model.approval.scopeApproved) {
          return this.fail(
            "Scope is not approved",
            "Approve the scope model before generating downstream artifacts.",
            false,
          );
        }
        let raw: unknown;
        try {
          raw = await this.provider.proposeScope({ model });
        } catch (error) {
          return this.fail(
            "Scope generation failed",
            error instanceof Error ? error.message : "Unknown error.",
            true,
          );
        }
        const payload = raw as {
          capabilities?: {
            name: string;
            summary: string;
            requirementIds: string[];
          }[];
          scopeItems?: {
            name: string;
            description: string;
            capabilityIndex: number;
            requirementIds: string[];
            priority: string;
          }[];
        };
        if (!payload.capabilities || !payload.scopeItems) {
          return this.fail(
            "Scope generation failed",
            "The provider response did not contain capabilities and scope items.",
            true,
          );
        }

        const capabilityIds: string[] = [];
        const { model: next } = commit(
          model,
          "Generated capabilities and functional scope",
          (draft) => {
            draft.capabilities = [];
            draft.scopeItems = [];
            for (const capability of payload.capabilities ?? []) {
              const id = nextId("capability", capabilityIds);
              capabilityIds.push(id);
              draft.capabilities.push({
                id,
                name: capability.name,
                summary: capability.summary,
                requirementIds: capability.requirementIds,
                provenance: "ai-recommendation",
              });
            }
            const itemIds: string[] = [];
            for (const item of payload.scopeItems ?? []) {
              const id = nextId("scopeItem", itemIds);
              itemIds.push(id);
              const capabilityId =
                capabilityIds[item.capabilityIndex] ?? capabilityIds[0];
              if (!capabilityId || item.requirementIds.length === 0) continue;
              draft.scopeItems.push({
                id,
                capabilityId,
                name: item.name.slice(0, 200),
                description: item.description,
                requirementIds: item.requirementIds,
                priority: (["must", "should", "could", "wont"].includes(
                  item.priority,
                )
                  ? item.priority
                  : "should") as Requirement["priority"],
                dependencies: [],
                provenance: "ai-recommendation",
                status: "in-review",
              });
            }
            return draft;
          },
        );

        this.state.model = next;
        this.state.artifacts.prd = buildPrd(next);
        this.state.artifacts.functionalScope = buildFunctionalScope(next);
        this.notify();
        return true;
      },
    );
    return done === true;
  }

  async generateArchitecture(cloud: Cloud | "recommend"): Promise<boolean> {
    const done = await this.withBusy(
      "architecture",
      "Generating architecture",
      async () => {
        const model = this.state.model;
        if (!model.approval.scopeApproved) {
          return this.fail(
            "Scope is not approved",
            "Architecture is generated from an approved scope model.",
            false,
          );
        }
        let selected: Cloud;
        if (cloud === "recommend") {
          const corpus = model.sources.map((s) => s.content).join(" ");
          const recommendation = recommendCloud({
            mentionsMicrosoft:
              /\b(azure|microsoft|entra|office ?365|dynamics)\b/i.test(corpus),
            mentionsGoogleWorkspace:
              /\b(google workspace|gcp|bigquery)\b/i.test(corpus),
            heavyAnalytics:
              model.requirements.filter((r) => r.type === "data").length >= 4,
            regulated: model.configuration.complianceTier !== "standard",
          });
          selected = recommendation.cloud;
          this.setConfiguration(
            { cloud: selected, cloudSelectionMode: "recommended" },
            `Selected ${selected} by recommendation`,
          );
        } else {
          selected = cloud;
          if (model.configuration.cloud !== cloud) {
            this.setConfiguration(
              { cloud, cloudSelectionMode: "explicit" },
              `Changed cloud to ${cloud}`,
            );
          }
        }

        const result = await generateArchitecture(
          this.provider,
          this.state.model,
          selected,
        );
        if (!result.ok) {
          return this.fail(
            "Architecture generation failed",
            [result.failure.message, ...result.failure.detail].join(" "),
            result.failure.retryable,
          );
        }
        this.state.artifacts.architecture = result.value;
        this.notify();
        return true;
      },
    );
    return done === true;
  }

  async generateSolutionDesign(): Promise<boolean> {
    const done = await this.withBusy(
      "solution",
      "Generating data, integration and AI strategy",
      async () => {
        const model = this.state.model;
        if (!model.approval.scopeApproved) {
          return this.fail(
            "Scope is not approved",
            "Solution design is generated from an approved scope model.",
            false,
          );
        }
        const [data, integrations, ai] = await Promise.all([
          generateDataStrategy(this.provider, model),
          generateIntegrations(this.provider, model),
          generateAiStrategy(this.provider, model),
        ]);
        const failures = [data, integrations, ai].filter((r) => !r.ok);
        if (failures.length === 3) {
          const first = failures[0];
          return this.fail(
            "Solution design generation failed",
            first && !first.ok
              ? first.failure.message
              : "All three generations failed.",
            true,
          );
        }
        if (data.ok) this.state.artifacts.dataStrategy = data.value;
        if (integrations.ok)
          this.state.artifacts.integrations = integrations.value;
        if (ai.ok) this.state.artifacts.aiStrategy = ai.value;
        this.notify();
        if (failures.length > 0) {
          this.state.lastError = {
            title: "Partial generation",
            detail: `${failures.length} of 3 sections could not be generated and were left empty rather than filled with placeholder content.`,
            retryable: true,
          };
          this.notify();
        }
        return true;
      },
    );
    return done === true;
  }

  async generateWorkstreams(): Promise<boolean> {
    const done = await this.withBusy(
      "estimate",
      "Building workstreams",
      async () => {
        const model = this.state.model;
        if (model.scopeItems.length === 0) {
          return this.fail(
            "No functional scope",
            "Generate the functional scope before estimating.",
            false,
          );
        }
        const result = await generateWorkstreams(this.provider, model);
        if (!result.ok) {
          return this.fail(
            "Workstream generation failed",
            [result.failure.message, ...result.failure.detail].join(" "),
            result.failure.retryable,
          );
        }
        this.state.artifacts.workstreams = result.value;
        this.state.workstreamsGeneratedAtVersion = this.state.model.version;
        this.notify();
        return true;
      },
    );
    return done === true;
  }

  setRateOverride(role: Role, value: number | null): void {
    if (value === null) delete this.state.rateOverrides[role];
    else this.state.rateOverrides[role] = value;
    this.notify();
  }

  // ---------- configuration and change impact ----------

  /** Stages a configuration change for impact review instead of applying it blind. */
  stageConfiguration(
    patch: Partial<ScopeModel["configuration"]>,
    summary: string,
  ): void {
    this.state.pendingChange = {
      summary,
      apply: (model) => {
        const configuration = { ...model.configuration, ...patch };
        if (patch.expectedUsers !== undefined) {
          configuration.concurrencyTier = concurrencyTierForUsers(
            patch.expectedUsers,
          );
        }
        return { ...model, configuration };
      },
    };
    this.notify();
  }

  cancelPendingChange(): void {
    this.state.pendingChange = null;
    this.notify();
  }

  previewPendingChange(): ImpactAnalysis | null {
    const pending = this.state.pendingChange;
    if (!pending) return null;
    const { model, changeSet } = commit(
      this.state.model,
      pending.summary,
      (draft) => pending.apply(draft),
    );
    return analyseImpact(model, changeSet, this.artifactMetas());
  }

  applyPendingChange(): ImpactAnalysis | null {
    const pending = this.state.pendingChange;
    if (!pending) return null;
    const { model, changeSet } = commit(
      this.state.model,
      pending.summary,
      (draft) => pending.apply(draft),
    );
    const analysis = analyseImpact(model, changeSet, this.artifactMetas());
    this.state.model = model;
    this.state.lastImpact = analysis;
    this.state.pendingChange = null;
    this.applyStaleness(analysis);
    this.notify();
    return analysis;
  }

  private setConfiguration(
    patch: Partial<ScopeModel["configuration"]>,
    summary: string,
  ): void {
    const { model, changeSet } = commit(this.state.model, summary, (draft) => ({
      ...draft,
      configuration: { ...draft.configuration, ...patch },
    }));
    const analysis = analyseImpact(model, changeSet, this.artifactMetas());
    this.state.model = model;
    this.state.lastImpact = analysis;
    this.applyStaleness(analysis);
  }

  private markStaleFrom(model: ScopeModel): void {
    const changeSet = model.history[model.history.length - 1];
    if (!changeSet) {
      this.notify();
      return;
    }
    const analysis = analyseImpact(model, changeSet, this.artifactMetas());
    this.state.lastImpact = analysis;
    this.applyStaleness(analysis);
    this.notify();
  }

  private applyStaleness(analysis: ImpactAnalysis): void {
    const affectedKinds = analysis.affected.map((a) => a.kind);
    const mark = <T extends { meta: ArtifactMeta }>(
      artifact: T | null,
    ): T | null => {
      if (!artifact) return null;
      const stale = isArtifactStale(
        artifact.meta,
        analysis.changeSet,
        affectedKinds,
      );
      if (!stale) return artifact;
      const reasons = analysis.affected.find(
        (a) => a.kind === artifact.meta.kind,
      )?.reasons ?? ["A referenced requirement changed."];
      return {
        ...artifact,
        meta: { ...artifact.meta, stale: true, staleReason: reasons.join(" ") },
      };
    };
    this.state.artifacts.prd = mark(this.state.artifacts.prd);
    this.state.artifacts.functionalScope = mark(
      this.state.artifacts.functionalScope,
    );
    this.state.artifacts.architecture = mark(this.state.artifacts.architecture);
    this.state.artifacts.dataStrategy = mark(this.state.artifacts.dataStrategy);
    this.state.artifacts.integrations = mark(this.state.artifacts.integrations);
    this.state.artifacts.aiStrategy = mark(this.state.artifacts.aiStrategy);
  }

  /** Selective regeneration: only the artifact asked for is rebuilt. */
  async regenerate(kind: ArtifactKind): Promise<boolean> {
    switch (kind) {
      case "prd":
      case "functional-scope":
        this.state.artifacts.prd = buildPrd(this.state.model);
        this.state.artifacts.functionalScope = buildFunctionalScope(
          this.state.model,
        );
        this.notify();
        return true;
      case "architecture":
        return this.generateArchitecture(
          this.state.model.configuration.cloud ?? "recommend",
        );
      case "data-strategy":
      case "integration-architecture":
      case "ai-strategy":
        return this.generateSolutionDesign();
      case "estimate":
        return this.generateWorkstreams();
      default:
        return false;
    }
  }

  // ---------- derived ----------

  artifactMetas(): ArtifactMeta[] {
    const a = this.state.artifacts;
    const candidates: ({ meta: ArtifactMeta } | null)[] = [
      a.prd,
      a.functionalScope,
      a.architecture,
      a.dataStrategy,
      a.integrations,
      a.aiStrategy,
    ];
    const metas: ArtifactMeta[] = [];
    for (const candidate of candidates) {
      if (candidate) metas.push(candidate.meta);
    }
    if (a.workstreams && this.state.workstreamsGeneratedAtVersion !== null) {
      metas.push({
        artifactId: `ART-estimate-v${this.state.workstreamsGeneratedAtVersion}`,
        kind: "estimate",
        scopeModelVersion: this.state.workstreamsGeneratedAtVersion,
        requirementIds: [
          ...new Set(a.workstreams.flatMap((w) => w.requirementIds)),
        ],
        assumptionIds: [],
        generatedAt: new Date().toISOString(),
        generatedBy: this.provider.name,
        promptVersion: "v1",
        status: "in-review",
        stale:
          this.state.workstreamsGeneratedAtVersion !== this.state.model.version,
        staleReason:
          this.state.workstreamsGeneratedAtVersion !== this.state.model.version
            ? "The scope model changed since the workstreams were generated."
            : "",
      });
    }
    return metas;
  }

  estimate(): ReturnType<typeof computeEstimate> | null {
    const workstreams = this.state.artifacts.workstreams;
    if (!workstreams) return null;
    return computeEstimate(
      this.state.model,
      workstreams,
      this.state.rateOverrides,
    );
  }

  estimateValue(): Estimate | null {
    const result = this.estimate();
    return result && result.ok ? result.value : null;
  }

  coverage() {
    return computeCoverage(this.state.model);
  }

  quality() {
    return runQualityGate(this.state.model, this.artifactMetas(), {
      architecture: this.state.artifacts.architecture,
      integrations: this.state.artifacts.integrations,
      aiStrategy: this.state.artifacts.aiStrategy,
      workstreams: this.state.artifacts.workstreams,
      estimate: this.estimateValue(),
    });
  }

  packageModel(): PackageModel {
    return {
      generatedAt: new Date().toISOString(),
      model: this.state.model,
      prd: this.state.artifacts.prd,
      functionalScope: this.state.artifacts.functionalScope,
      architecture: this.state.artifacts.architecture,
      dataStrategy: this.state.artifacts.dataStrategy,
      integrations: this.state.artifacts.integrations,
      aiStrategy: this.state.artifacts.aiStrategy,
      estimate: this.estimateValue(),
      coverage: this.coverage(),
      quality: this.quality(),
      lastImpact: this.state.lastImpact,
      disclaimer: PACKAGE_DISCLAIMER,
    };
  }

  openQuestions(): ClarificationQuestion[] {
    return this.state.model.questions.filter((q) => !q.resolved);
  }

  requirement(id: string): Requirement | undefined {
    return this.state.model.requirements.find((r) => r.id === id);
  }

  source(id: string): SourceDocument | undefined {
    return this.state.model.sources.find((s) => s.id === id);
  }
}
