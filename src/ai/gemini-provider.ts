import {
  AiProvider,
  ArchitectureRequest,
  ExtractionRequest,
  ProviderError,
  ScopeRequest,
  WorkstreamRequest,
} from "./provider";
import { UNTRUSTED_PREAMBLE, wrapUntrusted } from "./envelope";

export interface GeminiConfig {
  readonly apiKey: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly maxRetries: number;
  readonly endpoint?: string;
}

export class GeminiProvider implements AiProvider {
  public readonly name = "gemini" as const;

  constructor(private readonly config: GeminiConfig) {
    if (!config.apiKey) {
      throw new ProviderError(
        "unavailable",
        "GEMINI_API_KEY is not configured.",
      );
    }
  }

  private systemPrompt(task: string): string {
    return [
      "You are a solution architect assisting with pre-sales scoping.",
      UNTRUSTED_PREAMBLE,
      "Return a single JSON object and nothing else: no prose, no markdown fence.",
      "Never invent budgets, user volumes, deadlines, compliance certifications or service capabilities.",
      "If information is missing, raise it as a clarification question rather than filling the gap.",
      "Never return hours, day rates, costs, currency amounts or percentages of effort.",
      `Task: ${task}`,
    ].join("\n");
  }

  private async call(system: string, user: string): Promise<unknown> {
    const endpoint =
      this.config.endpoint ??
      `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent`;

    let lastError: ProviderError | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        const response = await fetch(
          `${endpoint}?key=${encodeURIComponent(this.config.apiKey)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: [{ role: "user", parts: [{ text: user }] }],
              generationConfig: {
                responseMimeType: "application/json",
                temperature: 0.2,
              },
            }),
          },
        );

        if (response.status === 429) {
          lastError = new ProviderError(
            "rate-limit",
            "Provider rate limit reached.",
            true,
          );
          await delay(2 ** attempt * 1000);
          continue;
        }
        if (response.status >= 500) {
          lastError = new ProviderError(
            "unavailable",
            `Provider returned ${response.status}.`,
            true,
          );
          await delay(2 ** attempt * 1000);
          continue;
        }
        if (!response.ok) {
          throw new ProviderError(
            "unknown",
            `Provider returned ${response.status}.`,
          );
        }

        const payload = (await response.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text =
          payload.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? "")
            .join("") ?? "";
        if (text.trim().length === 0) {
          throw new ProviderError(
            "empty-output",
            "Provider returned no content.",
          );
        }
        try {
          return JSON.parse(stripFence(text));
        } catch {
          throw new ProviderError(
            "invalid-json",
            "Provider response was not valid JSON.",
          );
        }
      } catch (error) {
        clearTimeout(timer);
        if (error instanceof ProviderError) {
          if (!error.retryable) throw error;
          lastError = error;
          continue;
        }
        if (isAbort(error)) {
          lastError = new ProviderError(
            "timeout",
            `Provider did not respond within ${this.config.timeoutMs}ms.`,
            true,
          );
          continue;
        }
        throw new ProviderError("unavailable", describe(error));
      } finally {
        clearTimeout(timer);
      }
    }
    throw (
      lastError ??
      new ProviderError("unknown", "Provider call failed after retries.")
    );
  }

  async extractRequirements(request: ExtractionRequest): Promise<unknown> {
    const sources = request.sources
      .map((s) => wrapUntrusted(s.id, s.name, s.content))
      .join("\n\n");
    return this.call(
      this.systemPrompt(
        "Extract discrete requirements. For each, return type, description, priority, provenance, sourceId and an exact verbatim quote from the source that supports it.",
      ),
      [
        `Customer: ${request.customerName}`,
        `Industry: ${request.industry}`,
        `Objectives: ${request.objectives.join("; ")}`,
        sources,
        'Respond as {"requirements":[],"questions":[],"assumptions":[],"risks":[]}.',
      ].join("\n\n"),
    );
  }

  async proposeScope(request: ScopeRequest): Promise<unknown> {
    return this.call(
      this.systemPrompt(
        "Group requirements into capabilities and deliverable scope items. Every scope item must list the requirement ids it covers.",
      ),
      JSON.stringify(compactRequirements(request)),
    );
  }

  async proposeArchitecture(request: ArchitectureRequest): Promise<unknown> {
    return this.call(
      this.systemPrompt(
        `Propose a ${request.cloud} architecture. Name real services from that provider only.`,
      ),
      JSON.stringify({
        ...compactRequirements({ model: request.model }),
        cloud: request.cloud,
      }),
    );
  }

  async proposeDataStrategy(request: ScopeRequest): Promise<unknown> {
    return this.call(
      this.systemPrompt(
        "Propose a data strategy covering domains, ownership, storage, retention and privacy.",
      ),
      JSON.stringify(compactRequirements(request)),
    );
  }

  async proposeIntegrations(request: ScopeRequest): Promise<unknown> {
    return this.call(
      this.systemPrompt(
        "Propose the integration inventory. Each integration must cite the requirement ids that justify it.",
      ),
      JSON.stringify(compactRequirements(request)),
    );
  }

  async proposeAiStrategy(request: ScopeRequest): Promise<unknown> {
    return this.call(
      this.systemPrompt(
        "Propose AI use cases, evaluation approach and responsible AI controls.",
      ),
      JSON.stringify(compactRequirements(request)),
    );
  }

  async proposeWorkstreams(request: WorkstreamRequest): Promise<unknown> {
    return this.call(
      this.systemPrompt(
        'Propose delivery workstreams. For each return a complexity band of exactly "S", "M", "L" or "XL", a rationale, drivers, requirement ids, dependencies and a role mix summing to 1. Return no hours, rates or costs.',
      ),
      JSON.stringify(compactRequirements({ model: request.model })),
    );
  }
}

function compactRequirements(request: ScopeRequest) {
  return {
    requirements: request.model.requirements.map((r) => ({
      id: r.id,
      type: r.type,
      priority: r.priority,
      description: r.description,
    })),
    scopeItems: request.model.scopeItems.map((i) => ({
      id: i.id,
      name: i.name,
      requirementIds: i.requirementIds,
      capabilityId: i.capabilityId,
    })),
    configuration: request.model.configuration,
  };
}

function stripFence(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();
}

function isAbort(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: string }).name === "AbortError"
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown provider failure.";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
