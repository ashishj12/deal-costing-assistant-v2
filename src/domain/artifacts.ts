import { s, Schema, Infer } from "./schema";
import { ID_PATTERNS } from "./ids";
import { ProvenanceSchema, ReviewStatusSchema } from "./provenance";
import { CloudSchema, PrioritySchema } from "./entities";

const id = (pattern: RegExp): Schema<string> => s.string().regex(pattern);

export const ARTIFACT_KINDS = [
  "prd",
  "functional-scope",
  "architecture",
  "data-strategy",
  "integration-architecture",
  "ai-strategy",
  "estimate",
] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];
export const ArtifactKindSchema = s.enum(ARTIFACT_KINDS);

export const ARTIFACT_LABEL: Record<ArtifactKind, string> = {
  prd: "Product requirements document",
  "functional-scope": "Functional scope",
  architecture: "Solution architecture",
  "data-strategy": "Data strategy",
  "integration-architecture": "Integration architecture",
  "ai-strategy": "AI strategy",
  estimate: "Effort and ROM estimate",
};

/** Metadata every generated artifact carries, without exception. */
export const ArtifactMetaSchema = s.object({
  artifactId: s.string().regex(ID_PATTERNS.artifact),
  kind: ArtifactKindSchema,
  scopeModelVersion: s.number().int().gte(0),
  requirementIds: s.array(id(ID_PATTERNS.requirement)).default([]),
  assumptionIds: s.array(id(ID_PATTERNS.assumption)).default([]),
  generatedAt: s.string().minLength(1),
  generatedBy: s.enum(["mock", "gemini", "deterministic"] as const),
  promptVersion: s.string().default("v1"),
  status: ReviewStatusSchema,
  stale: s.boolean().default(false),
  staleReason: s.string().default(""),
});
export type ArtifactMeta = Infer<typeof ArtifactMetaSchema>;

export const PrdSectionSchema = s.object({
  id: s.string().minLength(1),
  heading: s.string().minLength(2),
  body: s.string().minLength(1),
  requirementIds: s.array(id(ID_PATTERNS.requirement)).default([]),
  provenance: ProvenanceSchema,
});
export type PrdSection = Infer<typeof PrdSectionSchema>;

export const PrdArtifactSchema = s.object({
  meta: ArtifactMetaSchema,
  title: s.string().minLength(3),
  executiveSummary: s.string().minLength(10),
  sections: s.array(PrdSectionSchema).nonEmpty(),
});
export type PrdArtifact = Infer<typeof PrdArtifactSchema>;

export const FunctionalScopeArtifactSchema = s.object({
  meta: ArtifactMetaSchema,
  packages: s
    .array(
      s.object({
        id: s.string().minLength(2),
        name: s.string().minLength(2),
        description: s.string().default(""),
        scopeItemIds: s.array(id(ID_PATTERNS.scopeItem)).default([]),
      }),
    )
    .default([]),
  exclusions: s.array(s.string()).default([]),
});
export type FunctionalScopeArtifact = Infer<
  typeof FunctionalScopeArtifactSchema
>;

export const ArchitectureComponentSchema = s.object({
  id: id(ID_PATTERNS.component),
  name: s.string().minLength(2),
  layer: s.enum([
    "edge",
    "application",
    "integration",
    "data",
    "ai",
    "security",
    "observability",
  ] as const),
  cloudService: s.string().minLength(2),
  purpose: s.string().minLength(10),
  rationale: s.string().minLength(10),
  tradeoffs: s.array(s.string()).default([]),
  risks: s.array(s.string()).default([]),
  securityNotes: s.string().default(""),
  scalabilityNotes: s.string().default(""),
  deploymentNotes: s.string().default(""),
  requirementIds: s.array(id(ID_PATTERNS.requirement)).default([]),
  dependsOn: s.array(id(ID_PATTERNS.component)).default([]),
  provenance: ProvenanceSchema,
});
export type ArchitectureComponent = Infer<typeof ArchitectureComponentSchema>;

export const ArchitectureEdgeSchema = s.object({
  from: id(ID_PATTERNS.component),
  to: id(ID_PATTERNS.component),
  label: s.string().default(""),
  kind: s.enum(["sync", "async", "data", "control"] as const).default("sync"),
});
export type ArchitectureEdge = Infer<typeof ArchitectureEdgeSchema>;

export const ArchitectureArtifactSchema = s.object({
  meta: ArtifactMetaSchema,
  cloud: CloudSchema,
  summary: s.string().minLength(10),
  components: s.array(ArchitectureComponentSchema).nonEmpty(),
  edges: s.array(ArchitectureEdgeSchema).default([]),
  crossCuttingConcerns: s.array(s.string()).default([]),
});
export type ArchitectureArtifact = Infer<typeof ArchitectureArtifactSchema>;

export const DataStrategyArtifactSchema = s.object({
  meta: ArtifactMetaSchema,
  domains: s
    .array(
      s.object({
        id: id(ID_PATTERNS.dataDomain),
        name: s.string().minLength(2),
        owner: s.string().default("To be confirmed"),
        sources: s.array(s.string()).default([]),
        storage: s.string().default(""),
        classification: s
          .enum(["public", "internal", "confidential", "restricted"] as const)
          .default("internal"),
        retention: s.string().default(""),
        requirementIds: s.array(id(ID_PATTERNS.requirement)).default([]),
        provenance: ProvenanceSchema,
      }),
    )
    .default([]),
  governance: s.array(s.string()).default([]),
  privacy: s.array(s.string()).default([]),
  backupRecovery: s.string().default(""),
  reporting: s.string().default(""),
});
export type DataStrategyArtifact = Infer<typeof DataStrategyArtifactSchema>;

export const IntegrationArtifactSchema = s.object({
  meta: ArtifactMetaSchema,
  integrations: s
    .array(
      s.object({
        id: id(ID_PATTERNS.integration),
        name: s.string().minLength(2),
        sourceSystem: s.string().minLength(1),
        targetSystem: s.string().minLength(1),
        protocol: s.enum([
          "rest",
          "graphql",
          "soap",
          "event",
          "file",
          "jdbc",
        ] as const),
        direction: s.enum(["inbound", "outbound", "bidirectional"] as const),
        authentication: s.string().default(""),
        errorHandling: s.string().default(""),
        retryBehaviour: s.string().default(""),
        monitoring: s.string().default(""),
        requirementIds: s.array(id(ID_PATTERNS.requirement)).default([]),
        provenance: ProvenanceSchema,
      }),
    )
    .default([]),
});
export type IntegrationArtifact = Infer<typeof IntegrationArtifactSchema>;

export const AiStrategyArtifactSchema = s.object({
  meta: ArtifactMetaSchema,
  useCases: s
    .array(
      s.object({
        id: id(ID_PATTERNS.aiUseCase),
        name: s.string().minLength(2),
        description: s.string().default(""),
        pattern: s.enum([
          "rag",
          "classification",
          "extraction",
          "agent",
          "summarisation",
        ] as const),
        dataRequirements: s.array(s.string()).default([]),
        humanReview: s.string().default(""),
        evaluation: s.string().default(""),
        requirementIds: s.array(id(ID_PATTERNS.requirement)).default([]),
        provenance: ProvenanceSchema,
      }),
    )
    .default([]),
  modelOptions: s.array(s.string()).default([]),
  responsibleAi: s.array(s.string()).default([]),
  monitoring: s.array(s.string()).default([]),
});
export type AiStrategyArtifact = Infer<typeof AiStrategyArtifactSchema>;

export const COMPLEXITY_BANDS = ["S", "M", "L", "XL"] as const;
export type ComplexityBand = (typeof COMPLEXITY_BANDS)[number];
export const ComplexityBandSchema = s.enum(COMPLEXITY_BANDS);

/**
 * What a provider is permitted to return for effort. Note the absence of any
 * numeric field: hours, rates and currency are produced only by the
 * deterministic estimator, never by a model.
 */
export const WorkstreamProposalSchema = s.object({
  id: s.string().regex(ID_PATTERNS.workstream),
  name: s.string().minLength(3),
  description: s.string().default(""),
  band: ComplexityBandSchema,
  bandRationale: s.string().minLength(10),
  drivers: s.array(s.string()).default([]),
  requirementIds: s.array(id(ID_PATTERNS.requirement)).nonEmpty(),
  dependencies: s.array(s.string().regex(ID_PATTERNS.workstream)).default([]),
  roleMix: s.record(s.number().gte(0).lte(1)),
  priority: PrioritySchema,
});
export type WorkstreamProposal = Infer<typeof WorkstreamProposalSchema>;

export const ARTIFACT_SCHEMAS = {
  prd: PrdArtifactSchema,
  "functional-scope": FunctionalScopeArtifactSchema,
  architecture: ArchitectureArtifactSchema,
  "data-strategy": DataStrategyArtifactSchema,
  "integration-architecture": IntegrationArtifactSchema,
  "ai-strategy": AiStrategyArtifactSchema,
} as const;
