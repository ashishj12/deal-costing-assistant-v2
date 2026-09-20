import {
  Assumption,
  ClarificationQuestion,
  Requirement,
  Risk,
  ScopeModel,
  SourceDocument,
} from "../domain/entities";
import {
  ArchitectureArtifact,
  ArchitectureArtifactSchema,
  AiStrategyArtifact,
  AiStrategyArtifactSchema,
  ArtifactMeta,
  DataStrategyArtifact,
  DataStrategyArtifactSchema,
  IntegrationArtifact,
  IntegrationArtifactSchema,
  WorkstreamProposal,
  WorkstreamProposalSchema,
  artifactIdFor,
} from "./artifact-helpers";
import {
  RequirementSchema,
  AssumptionSchema,
  ClarificationQuestionSchema,
  RiskSchema,
} from "../domain/entities";
import { nextId } from "../domain/ids";
import { s } from "../domain/schema";
import { AiProvider, ProviderError } from "./provider";
import { resolveCitation } from "./citation-resolver";
import { detectInjectionAttempts } from "./envelope";

export interface PipelineFailure {
  readonly kind: ProviderError["kind"] | "schema-mismatch";
  readonly message: string;
  readonly detail: readonly string[];
  readonly retryable: boolean;
}

export type PipelineResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: PipelineFailure };

function failFromError(error: unknown): PipelineFailure {
  if (error instanceof ProviderError) {
    return {
      kind: error.kind,
      message: error.message,
      detail: [],
      retryable: error.retryable,
    };
  }
  return {
    kind: "unknown",
    message:
      error instanceof Error
        ? error.message
        : "Generation failed for an unknown reason.",
    detail: [],
    retryable: false,
  };
}

const ExtractionEnvelope = s.object({
  requirements: s.array(
    s.object({
      type: s.string(),
      description: s.string().minLength(10),
      priority: s.string(),
      provenance: s.string(),
      sourceId: s.string().nullable(),
      quote: s.string().nullable(),
      rationale: s.string().default(""),
      confidence: s.number().gte(0).lte(1).default(0.6),
    }),
  ),
  questions: s
    .array(
      s.object({
        text: s.string().minLength(5),
        severity: s.string(),
        category: s.string(),
        blocking: s.boolean(),
      }),
    )
    .default([]),
  assumptions: s
    .array(
      s.object({
        text: s.string().minLength(10),
        rationale: s.string().default(""),
      }),
    )
    .default([]),
  risks: s
    .array(
      s.object({
        title: s.string().minLength(5),
        description: s.string().default(""),
        likelihood: s.string(),
        impact: s.string(),
        mitigation: s.string().default(""),
      }),
    )
    .default([]),
});

export interface ExtractionOutcome {
  readonly requirements: Requirement[];
  readonly questions: ClarificationQuestion[];
  readonly assumptions: Assumption[];
  readonly risks: Risk[];
  readonly downgraded: readonly { id: string; reason: string }[];
  readonly injectionFindings: readonly { sourceId: string; excerpt: string }[];
}

const VALID_TYPES = [
  "functional",
  "non-functional",
  "integration",
  "data",
  "security",
  "compliance",
  "operational",
];
const VALID_PRIORITIES = ["must", "should", "could", "wont"];
const VALID_SEVERITIES = ["blocking", "high", "medium", "low"];
const VALID_CATEGORIES = [
  "scale",
  "compliance",
  "integration",
  "commercial",
  "data",
  "delivery",
  "functional",
];
const VALID_LIKELIHOOD = ["low", "medium", "high"];

const pick = (value: string, allowed: string[], fallback: string): string =>
  allowed.includes(value) ? value : fallback;

/**
 * Turns raw provider output into validated domain entities.
 *
 * Three things happen here that cannot be skipped: schema validation,
 * citation resolution against the real source text, and provenance
 * downgrading when a citation does not resolve.
 */
export async function runExtraction(
  provider: AiProvider,
  model: ScopeModel,
  sources: readonly SourceDocument[],
): Promise<PipelineResult<ExtractionOutcome>> {
  let raw: unknown;
  try {
    raw = await provider.extractRequirements({
      sources: sources.map((s) => ({
        id: s.id,
        name: s.name,
        content: s.content,
      })),
      customerName: model.customer.customerName,
      industry: model.customer.industry,
      objectives: model.customer.businessObjectives,
      existingRequirementIds: model.requirements.map((r) => r.id),
    });
  } catch (error) {
    return { ok: false, failure: failFromError(error) };
  }

  const parsed = ExtractionEnvelope.safeParse(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      failure: {
        kind: "schema-mismatch",
        message: "The provider response did not match the extraction schema.",
        detail: parsed.issues
          .map((i) => `${i.path}: ${i.message}`)
          .slice(0, 10),
        retryable: true,
      },
    };
  }

  const injectionFindings = sources.flatMap((source) =>
    detectInjectionAttempts(source.content).map((f) => ({
      sourceId: source.id,
      excerpt: f.excerpt,
    })),
  );

  const requirementIds = [...model.requirements.map((r) => r.id)];
  const requirements: Requirement[] = [];
  const downgraded: { id: string; reason: string }[] = [];

  for (const candidate of parsed.value.requirements) {
    const id = nextId("requirement", requirementIds);
    requirementIds.push(id);

    const resolution = resolveCitation(
      sources,
      candidate.sourceId,
      candidate.quote,
    );
    let provenance = pick(
      candidate.provenance,
      [
        "customer-stated",
        "ai-inferred",
        "user-assumption",
        "ai-recommendation",
        "out-of-scope",
      ],
      "ai-inferred",
    );

    if (provenance === "customer-stated" && !resolution.resolved) {
      provenance = "ai-inferred";
      downgraded.push({ id, reason: resolution.reason });
    }

    const built = RequirementSchema.safeParse({
      id,
      type: pick(candidate.type, VALID_TYPES, "functional"),
      description: candidate.description.slice(0, 2000),
      priority: pick(candidate.priority, VALID_PRIORITIES, "should"),
      provenance,
      sourceSpan: resolution.resolved ? resolution.span : null,
      citationResolved: resolution.resolved,
      dependencies: [],
      openQuestionIds: [],
      status: "in-review",
      confidence: candidate.confidence,
      rationale: candidate.rationale,
      introducedInVersion: model.version + 1,
      lastModifiedInVersion: model.version + 1,
    });
    if (built.ok) requirements.push(built.value);
  }

  if (requirements.length === 0) {
    return {
      ok: false,
      failure: {
        kind: "empty-output",
        message:
          "No requirement survived validation. Check that the source material describes requirements.",
        detail: [],
        retryable: true,
      },
    };
  }

  const questionIds = [...model.questions.map((q) => q.id)];
  const questions: ClarificationQuestion[] = [];
  for (const candidate of parsed.value.questions) {
    const id = nextId("question", questionIds);
    questionIds.push(id);
    const built = ClarificationQuestionSchema.safeParse({
      id,
      text: candidate.text,
      relatedRequirementIds: [],
      severity: pick(candidate.severity, VALID_SEVERITIES, "medium"),
      category: pick(candidate.category, VALID_CATEGORIES, "functional"),
      blocking: candidate.blocking,
      resolved: false,
      answer: "",
      source: "ai-proposed",
    });
    if (built.ok) questions.push(built.value);
  }

  const assumptionIds = [...model.assumptions.map((a) => a.id)];
  const assumptions: Assumption[] = [];
  for (const candidate of parsed.value.assumptions) {
    const id = nextId("assumption", assumptionIds);
    assumptionIds.push(id);
    const built = AssumptionSchema.safeParse({
      id,
      text: candidate.text,
      rationale: candidate.rationale,
      affectedRequirementIds: [],
      needsValidation: true,
      status: "in-review",
      owner: "Unassigned",
      source: "ai-proposed",
      introducedInVersion: model.version + 1,
    });
    if (built.ok) assumptions.push(built.value);
  }

  const riskIds = [...model.risks.map((r) => r.id)];
  const risks: Risk[] = [];
  for (const candidate of parsed.value.risks) {
    const id = nextId("risk", riskIds);
    riskIds.push(id);
    const built = RiskSchema.safeParse({
      id,
      title: candidate.title,
      description: candidate.description,
      likelihood: pick(candidate.likelihood, VALID_LIKELIHOOD, "medium"),
      impact: pick(candidate.impact, VALID_LIKELIHOOD, "medium"),
      mitigation: candidate.mitigation,
      relatedRequirementIds: [],
      provenance: "ai-inferred",
    });
    if (built.ok) risks.push(built.value);
  }

  return {
    ok: true,
    value: {
      requirements,
      questions,
      assumptions,
      risks,
      downgraded,
      injectionFindings,
    },
  };
}

function meta(
  kind: ArtifactMeta["kind"],
  model: ScopeModel,
  provider: AiProvider,
  requirementIds: readonly string[],
): ArtifactMeta {
  return {
    artifactId: artifactIdFor(kind, model.version),
    kind,
    scopeModelVersion: model.version,
    requirementIds: [...new Set(requirementIds)],
    assumptionIds: model.assumptions
      .filter((a) => a.status === "approved")
      .map((a) => a.id),
    generatedAt: new Date().toISOString(),
    generatedBy: provider.name,
    promptVersion: "v1",
    status: "in-review",
    stale: false,
    staleReason: "",
  };
}

async function generate<T>(
  call: () => Promise<unknown>,
  schema: {
    safeParse: (
      v: unknown,
    ) =>
      | { ok: true; value: T }
      | { ok: false; issues: readonly { path: string; message: string }[] };
  },
  enrich: (raw: Record<string, unknown>) => Record<string, unknown>,
): Promise<PipelineResult<T>> {
  let raw: unknown;
  try {
    raw = await call();
  } catch (error) {
    return { ok: false, failure: failFromError(error) };
  }
  if (typeof raw !== "object" || raw === null) {
    return {
      ok: false,
      failure: {
        kind: "invalid-json",
        message: "Provider returned a non-object response.",
        detail: [],
        retryable: true,
      },
    };
  }
  const parsed = schema.safeParse(enrich(raw as Record<string, unknown>));
  if (!parsed.ok) {
    return {
      ok: false,
      failure: {
        kind: "schema-mismatch",
        message: "The provider response did not match the artifact schema.",
        detail: parsed.issues
          .map((i) => `${i.path}: ${i.message}`)
          .slice(0, 10),
        retryable: true,
      },
    };
  }
  return { ok: true, value: parsed.value };
}

export function generateArchitecture(
  provider: AiProvider,
  model: ScopeModel,
  cloud: ArchitectureArtifact["cloud"],
): Promise<PipelineResult<ArchitectureArtifact>> {
  return generate(
    () => provider.proposeArchitecture({ model, cloud }),
    ArchitectureArtifactSchema,
    (raw) => ({
      ...raw,
      meta: meta(
        "architecture",
        model,
        provider,
        ((raw["components"] as { requirementIds?: string[] }[]) ?? []).flatMap(
          (c) => c.requirementIds ?? [],
        ),
      ),
    }),
  );
}

export function generateDataStrategy(
  provider: AiProvider,
  model: ScopeModel,
): Promise<PipelineResult<DataStrategyArtifact>> {
  return generate(
    () => provider.proposeDataStrategy({ model }),
    DataStrategyArtifactSchema,
    (raw) => ({
      ...raw,
      meta: meta(
        "data-strategy",
        model,
        provider,
        ((raw["domains"] as { requirementIds?: string[] }[]) ?? []).flatMap(
          (d) => d.requirementIds ?? [],
        ),
      ),
    }),
  );
}

export function generateIntegrations(
  provider: AiProvider,
  model: ScopeModel,
): Promise<PipelineResult<IntegrationArtifact>> {
  return generate(
    () => provider.proposeIntegrations({ model }),
    IntegrationArtifactSchema,
    (raw) => ({
      ...raw,
      meta: meta(
        "integration-architecture",
        model,
        provider,
        (
          (raw["integrations"] as { requirementIds?: string[] }[]) ?? []
        ).flatMap((i) => i.requirementIds ?? []),
      ),
    }),
  );
}

export function generateAiStrategy(
  provider: AiProvider,
  model: ScopeModel,
): Promise<PipelineResult<AiStrategyArtifact>> {
  return generate(
    () => provider.proposeAiStrategy({ model }),
    AiStrategyArtifactSchema,
    (raw) => ({
      ...raw,
      meta: meta(
        "ai-strategy",
        model,
        provider,
        ((raw["useCases"] as { requirementIds?: string[] }[]) ?? []).flatMap(
          (u) => u.requirementIds ?? [],
        ),
      ),
    }),
  );
}

/**
 * Workstreams are the one place a provider touches the estimate, and it may
 * only supply a bounded complexity band. The schema rejects any numeric
 * effort field outright.
 */
export async function generateWorkstreams(
  provider: AiProvider,
  model: ScopeModel,
): Promise<PipelineResult<WorkstreamProposal[]>> {
  let raw: unknown;
  try {
    raw = await provider.proposeWorkstreams({ model });
  } catch (error) {
    return { ok: false, failure: failFromError(error) };
  }
  const list = (raw as { workstreams?: unknown[] })?.workstreams;
  if (!Array.isArray(list)) {
    return {
      ok: false,
      failure: {
        kind: "schema-mismatch",
        message: "Provider returned no workstream array.",
        detail: [],
        retryable: true,
      },
    };
  }

  const out: WorkstreamProposal[] = [];
  const issues: string[] = [];
  for (const candidate of list) {
    if (typeof candidate === "object" && candidate !== null) {
      const record = candidate as Record<string, unknown>;
      for (const banned of [
        "hours",
        "effort",
        "cost",
        "rate",
        "price",
        "days",
      ]) {
        if (banned in record) {
          return {
            ok: false,
            failure: {
              kind: "schema-mismatch",
              message: `Provider returned a forbidden numeric field "${banned}". Commercial values are computed deterministically and never accepted from a model.`,
              detail: [],
              retryable: false,
            },
          };
        }
      }
    }
    const parsed = WorkstreamProposalSchema.safeParse(candidate);
    if (parsed.ok) out.push(parsed.value);
    else issues.push(...parsed.issues.map((i) => `${i.path}: ${i.message}`));
  }

  if (out.length === 0) {
    return {
      ok: false,
      failure: {
        kind: "schema-mismatch",
        message: "No workstream passed validation.",
        detail: issues.slice(0, 10),
        retryable: true,
      },
    };
  }
  return { ok: true, value: out };
}
