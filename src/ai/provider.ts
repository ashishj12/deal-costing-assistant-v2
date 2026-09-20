import { ScopeModel } from "../domain/entities";
import { Cloud } from "../domain/entities";

export type ProviderName = "mock" | "gemini";

export class ProviderError extends Error {
  constructor(
    public readonly kind:
      | "timeout"
      | "rate-limit"
      | "unavailable"
      | "invalid-json"
      | "schema-mismatch"
      | "empty-output"
      | "partial"
      | "unknown",
    message: string,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export interface ExtractionRequest {
  readonly sources: readonly { id: string; name: string; content: string }[];
  readonly customerName: string;
  readonly industry: string;
  readonly objectives: readonly string[];
  readonly existingRequirementIds: readonly string[];
}

export interface ExtractedRequirement {
  readonly type: string;
  readonly description: string;
  readonly priority: string;
  readonly provenance: string;
  readonly sourceId: string | null;
  readonly quote: string | null;
  readonly rationale: string;
  readonly confidence: number;
}

export interface ExtractionResponse {
  readonly requirements: readonly ExtractedRequirement[];
  readonly questions: readonly {
    text: string;
    severity: string;
    category: string;
    blocking: boolean;
  }[];
  readonly assumptions: readonly { text: string; rationale: string }[];
  readonly risks: readonly {
    title: string;
    description: string;
    likelihood: string;
    impact: string;
    mitigation: string;
  }[];
}

export interface ScopeRequest {
  readonly model: ScopeModel;
}

export interface ScopeResponse {
  readonly capabilities: readonly {
    name: string;
    summary: string;
    requirementIds: string[];
  }[];
  readonly scopeItems: readonly {
    name: string;
    description: string;
    capabilityIndex: number;
    requirementIds: string[];
    priority: string;
  }[];
  readonly exclusions: readonly string[];
}

export interface ArchitectureRequest {
  readonly model: ScopeModel;
  readonly cloud: Cloud;
}

export interface WorkstreamRequest {
  readonly model: ScopeModel;
}

/**
 * The provider contract. Note that no method returns hours, rates or money:
 * a provider may propose a complexity band and a rationale, and nothing more.
 * Every commercial number is produced by src/engines/estimation.ts.
 */
export interface AiProvider {
  readonly name: ProviderName;
  extractRequirements(request: ExtractionRequest): Promise<unknown>;
  proposeScope(request: ScopeRequest): Promise<unknown>;
  proposeArchitecture(request: ArchitectureRequest): Promise<unknown>;
  proposeDataStrategy(request: ScopeRequest): Promise<unknown>;
  proposeIntegrations(request: ScopeRequest): Promise<unknown>;
  proposeAiStrategy(request: ScopeRequest): Promise<unknown>;
  proposeWorkstreams(request: WorkstreamRequest): Promise<unknown>;
}
