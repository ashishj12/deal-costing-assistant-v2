import { s, Schema, Infer } from "./schema";
import { ID_PATTERNS } from "./ids";
import { ProvenanceSchema, ReviewStatusSchema } from "./provenance";

const id = (pattern: RegExp): Schema<string> => s.string().regex(pattern);

export const RequirementTypeSchema = s.enum([
  "functional",
  "non-functional",
  "integration",
  "data",
  "security",
  "compliance",
  "operational",
] as const);
export type RequirementType = Infer<typeof RequirementTypeSchema>;

export const PrioritySchema = s.enum([
  "must",
  "should",
  "could",
  "wont",
] as const);
export type Priority = Infer<typeof PrioritySchema>;

export const SeveritySchema = s.enum([
  "blocking",
  "high",
  "medium",
  "low",
] as const);
export type Severity = Infer<typeof SeveritySchema>;

export const SourceDocumentSchema = s.object({
  id: id(ID_PATTERNS.source),
  name: s.string().minLength(1).maxLength(260),
  kind: s.enum(["pasted-text", "txt", "md", "pdf", "docx"] as const),
  bytes: s.number().int().gte(0),
  content: s.string(),
  ingestedAt: s.string().minLength(1),
  checksum: s.string().minLength(4),
});
export type SourceDocument = Infer<typeof SourceDocumentSchema>;

export const SourceSpanSchema = s.object({
  sourceId: id(ID_PATTERNS.source),
  start: s.number().int().gte(0),
  end: s.number().int().gte(0),
  quote: s.string().minLength(1),
});
export type SourceSpan = Infer<typeof SourceSpanSchema>;

export const RequirementSchema = s
  .object({
    id: id(ID_PATTERNS.requirement),
    type: RequirementTypeSchema,
    description: s.string().minLength(10).maxLength(2000),
    priority: PrioritySchema,
    provenance: ProvenanceSchema,
    sourceSpan: SourceSpanSchema.nullable(),
    citationResolved: s.boolean().default(false),
    dependencies: s.array(id(ID_PATTERNS.requirement)).default([]),
    openQuestionIds: s.array(id(ID_PATTERNS.question)).default([]),
    status: ReviewStatusSchema,
    confidence: s.number().gte(0).lte(1),
    rationale: s.string().default(""),
    introducedInVersion: s.number().int().gte(0),
    lastModifiedInVersion: s.number().int().gte(0),
  })
  .refine(
    (r) => r.provenance !== "customer-stated" || r.sourceSpan !== null,
    "a customer-stated requirement must carry a source span",
  )
  .refine(
    (r) => !r.citationResolved || r.sourceSpan !== null,
    "citationResolved cannot be true without a source span",
  )
  .refine(
    (r) => !r.dependencies.includes(r.id),
    "a requirement cannot depend on itself",
  );
export type Requirement = Infer<typeof RequirementSchema>;

export const AssumptionSchema = s.object({
  id: id(ID_PATTERNS.assumption),
  text: s.string().minLength(10).maxLength(1000),
  rationale: s.string().default(""),
  affectedRequirementIds: s.array(id(ID_PATTERNS.requirement)).default([]),
  needsValidation: s.boolean().default(true),
  status: ReviewStatusSchema,
  owner: s.string().default("Unassigned"),
  source: s.enum(["ai-proposed", "user-authored"] as const),
  introducedInVersion: s.number().int().gte(0),
});
export type Assumption = Infer<typeof AssumptionSchema>;

export const ClarificationQuestionSchema = s.object({
  id: id(ID_PATTERNS.question),
  text: s.string().minLength(5).maxLength(1000),
  relatedRequirementIds: s.array(id(ID_PATTERNS.requirement)).default([]),
  severity: SeveritySchema,
  category: s.enum([
    "scale",
    "compliance",
    "integration",
    "commercial",
    "data",
    "delivery",
    "functional",
  ] as const),
  blocking: s.boolean(),
  resolved: s.boolean().default(false),
  answer: s.string().default(""),
  source: s.enum(["ai-proposed", "user-authored"] as const),
});
export type ClarificationQuestion = Infer<typeof ClarificationQuestionSchema>;

export const RiskSchema = s.object({
  id: id(ID_PATTERNS.risk),
  title: s.string().minLength(5).maxLength(200),
  description: s.string().default(""),
  likelihood: s.enum(["low", "medium", "high"] as const),
  impact: s.enum(["low", "medium", "high"] as const),
  mitigation: s.string().default(""),
  relatedRequirementIds: s.array(id(ID_PATTERNS.requirement)).default([]),
  provenance: ProvenanceSchema,
});
export type Risk = Infer<typeof RiskSchema>;

export const ScopeItemSchema = s.object({
  id: id(ID_PATTERNS.scopeItem),
  capabilityId: id(ID_PATTERNS.capability),
  name: s.string().minLength(3).maxLength(200),
  description: s.string().minLength(10),
  requirementIds: s.array(id(ID_PATTERNS.requirement)).nonEmpty(),
  priority: PrioritySchema,
  dependencies: s.array(id(ID_PATTERNS.scopeItem)).default([]),
  provenance: ProvenanceSchema,
  status: ReviewStatusSchema,
});
export type ScopeItem = Infer<typeof ScopeItemSchema>;

export const CapabilitySchema = s.object({
  id: id(ID_PATTERNS.capability),
  name: s.string().minLength(3).maxLength(160),
  summary: s.string().default(""),
  requirementIds: s.array(id(ID_PATTERNS.requirement)).default([]),
  provenance: ProvenanceSchema,
});
export type Capability = Infer<typeof CapabilitySchema>;

export const CloudSchema = s.enum(["aws", "azure", "gcp"] as const);
export type Cloud = Infer<typeof CloudSchema>;

export const ComplianceTierSchema = s.enum([
  "standard",
  "regulated",
  "critical",
] as const);
export type ComplianceTier = Infer<typeof ComplianceTierSchema>;

export const ConcurrencyTierSchema = s.enum([
  "pilot",
  "departmental",
  "enterprise",
  "internet-scale",
] as const);
export type ConcurrencyTier = Infer<typeof ConcurrencyTierSchema>;

export const ConfigurationSchema = s.object({
  cloud: CloudSchema.nullable(),
  cloudSelectionMode: s
    .enum(["explicit", "recommended"] as const)
    .default("explicit"),
  expectedUsers: s.number().int().gte(0),
  concurrencyTier: ConcurrencyTierSchema,
  complianceTier: ComplianceTierSchema,
  externalSystemCount: s.number().int().gte(0),
  dataComplexity: s.enum(["low", "medium", "high"] as const),
  productivityFactor: s.number().gte(0.5).lte(1.5),
  contingency: s.number().gte(0).lte(1),
  currency: s.enum(["USD", "EUR", "GBP", "INR", "AUD"] as const),
  teamCapacity: s.number().int().gte(1).lte(200),
  targetDeadlineWeeks: s.number().int().gte(0).nullable(),
});
export type Configuration = Infer<typeof ConfigurationSchema>;

export const CustomerContextSchema = s.object({
  customerName: s.string().minLength(1).maxLength(160),
  opportunityName: s.string().minLength(1).maxLength(200),
  industry: s.string().default(""),
  businessObjectives: s.array(s.string().minLength(3)).default([]),
  opportunityStatus: s
    .enum(["qualifying", "scoping", "proposal", "negotiation"] as const)
    .default("scoping"),
});
export type CustomerContext = Infer<typeof CustomerContextSchema>;

export const ChangeEntrySchema = s.object({
  entityId: s.string().minLength(1),
  entityKind: s.string().minLength(1),
  field: s.string().minLength(1),
  before: s.string(),
  after: s.string(),
  operation: s.enum(["created", "updated", "deleted"] as const),
});
export type ChangeEntry = Infer<typeof ChangeEntrySchema>;

export const ChangeSetSchema = s.object({
  version: s.number().int().gte(1),
  previousVersion: s.number().int().gte(0),
  at: s.string().minLength(1),
  author: s.string().default("reviewer"),
  summary: s.string().minLength(3),
  entries: s.array(ChangeEntrySchema).default([]),
  touchedEntityIds: s.array(s.string()).default([]),
  touchedFieldPaths: s.array(s.string()).default([]),
});
export type ChangeSet = Infer<typeof ChangeSetSchema>;

export const ApprovalStateSchema = s.object({
  scopeApproved: s.boolean().default(false),
  approvedAtVersion: s.number().int().gte(0).nullable(),
  approvedAt: s.string().nullable(),
  approvedBy: s.string().nullable(),
});
export type ApprovalState = Infer<typeof ApprovalStateSchema>;

export const ScopeModelSchema = s.object({
  sessionId: s.string().minLength(1),
  projectName: s.string().minLength(1).maxLength(200),
  version: s.number().int().gte(0),
  createdAt: s.string().minLength(1),
  updatedAt: s.string().minLength(1),
  customer: CustomerContextSchema,
  configuration: ConfigurationSchema,
  sources: s.array(SourceDocumentSchema).default([]),
  requirements: s.array(RequirementSchema).default([]),
  assumptions: s.array(AssumptionSchema).default([]),
  questions: s.array(ClarificationQuestionSchema).default([]),
  risks: s.array(RiskSchema).default([]),
  capabilities: s.array(CapabilitySchema).default([]),
  scopeItems: s.array(ScopeItemSchema).default([]),
  approval: ApprovalStateSchema,
  history: s.array(ChangeSetSchema).default([]),
  retiredIds: s.array(s.string()).default([]),
});
export type ScopeModel = Infer<typeof ScopeModelSchema>;
