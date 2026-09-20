import {
  AiProvider,
  ArchitectureRequest,
  ExtractionRequest,
  ProviderError,
  ScopeRequest,
  WorkstreamRequest,
} from "./provider";
import { catalogFor } from "../engines/cloud-catalog";
import { Requirement } from "../domain/entities";

interface Classification {
  readonly type: string;
  readonly priority: string;
  readonly confidence: number;
}

const TYPE_SIGNALS: readonly {
  type: string;
  pattern: RegExp;
  confidence: number;
}[] = [
  {
    type: "security",
    pattern:
      /\b(encrypt|authenticat|authoris|authoriz|sso|mfa|rbac|penetration|threat|secure)\b/i,
    confidence: 0.8,
  },
  {
    type: "compliance",
    pattern:
      /\b(gdpr|hipaa|sox|pci|iso ?27001|dpdp|audit trail|regulat|retention period|residency)\b/i,
    confidence: 0.85,
  },
  {
    type: "integration",
    pattern:
      /\b(integrat|api|webhook|sap|salesforce|workday|erp|crm|sftp|third[- ]party|interface with)\b/i,
    confidence: 0.8,
  },
  {
    type: "data",
    pattern:
      /\b(data|report|dashboard|analytic|warehouse|etl|migration|master data|schema)\b/i,
    confidence: 0.7,
  },
  {
    type: "non-functional",
    pattern:
      /\b(performance|latency|throughput|availab|uptime|scal|concurrent|response time|sla)\b/i,
    confidence: 0.8,
  },
  {
    type: "operational",
    pattern:
      /\b(monitor|support|backup|disaster recovery|runbook|deploy|maintenance|on-call)\b/i,
    confidence: 0.75,
  },
];

const PRIORITY_SIGNALS: readonly { priority: string; pattern: RegExp }[] = [
  {
    priority: "must",
    pattern: /\b(must|shall|mandatory|required|critical|non[- ]negotiable)\b/i,
  },
  {
    priority: "should",
    pattern: /\b(should|expected|important|strongly prefer)\b/i,
  },
  {
    priority: "could",
    pattern: /\b(could|nice to have|optional|desirable|if possible|future)\b/i,
  },
  {
    priority: "wont",
    pattern:
      /\b(out of scope|will not|excluded|not required|phase 2|later phase)\b/i,
  },
];

function classify(sentence: string): Classification {
  let type = "functional";
  let confidence = 0.6;
  for (const signal of TYPE_SIGNALS) {
    if (signal.pattern.test(sentence)) {
      type = signal.type;
      confidence = signal.confidence;
      break;
    }
  }
  let priority = "should";
  for (const signal of PRIORITY_SIGNALS) {
    if (signal.pattern.test(sentence)) {
      priority = signal.priority;
      confidence = Math.min(0.95, confidence + 0.05);
      break;
    }
  }
  return { type, priority, confidence };
}

/** Splits on sentence and bullet boundaries while preserving the raw text. */
function segments(content: string): string[] {
  return content
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.;])\s+(?=[A-Z0-9])/))
    .map((line) => line.replace(/^\s*[-*\u2022\d.)\]]+\s*/, "").trim())
    .filter((line) => line.length >= 25 && /[a-z]/i.test(line));
}

const NOISE =
  /^(dear|hi|hello|regards|kind regards|thanks|thank you|sincerely|attached|please find)/i;

export class MockProvider implements AiProvider {
  public readonly name = "mock" as const;

  async extractRequirements(request: ExtractionRequest): Promise<unknown> {
    if (request.sources.length === 0) {
      throw new ProviderError(
        "empty-output",
        "No source material was supplied for extraction.",
      );
    }

    const requirements: unknown[] = [];
    const seen = new Set<string>();

    for (const source of request.sources) {
      for (const sentence of segments(source.content)) {
        if (NOISE.test(sentence)) continue;
        const key = sentence.slice(0, 80).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const { type, priority, confidence } = classify(sentence);
        const outOfScope = priority === "wont";
        requirements.push({
          type,
          description:
            sentence.length > 1800 ? `${sentence.slice(0, 1797)}...` : sentence,
          priority,
          provenance: outOfScope ? "out-of-scope" : "customer-stated",
          sourceId: source.id,
          quote: sentence.slice(0, 180),
          rationale: `Classified as ${type} from wording in ${source.name}; priority inferred from modal verb.`,
          confidence,
        });
      }
    }

    if (requirements.length === 0) {
      throw new ProviderError(
        "empty-output",
        "No requirement-shaped statements were found. The material may be too short or may not describe requirements.",
      );
    }

    const corpus = request.sources
      .map((s) => s.content)
      .join("\n")
      .toLowerCase();
    const questions: unknown[] = [];
    const assumptions: unknown[] = [];

    if (!/\b\d[\d,]*\s*(users|seats|employees|customers)\b/.test(corpus)) {
      questions.push({
        text: "What is the expected number of users at go-live, and the growth expectation over the first 24 months?",
        severity: "blocking",
        category: "scale",
        blocking: true,
      });
      assumptions.push({
        text: "Expected user volume sits in the departmental band (up to 5,000 named users) until confirmed.",
        rationale:
          "No user volume was stated in the customer material; the estimate and architecture both depend on it.",
      });
    }
    if (!/(gdpr|hipaa|sox|pci|iso ?27001|dpdp)/.test(corpus)) {
      questions.push({
        text: "Which regulatory regimes and data residency constraints apply to this workload?",
        severity: "high",
        category: "compliance",
        blocking: true,
      });
    }
    if (!/(budget|cost|price|investment)/.test(corpus)) {
      questions.push({
        text: "Is there an approved budget envelope or a target commercial range for this engagement?",
        severity: "medium",
        category: "commercial",
        blocking: false,
      });
    }
    if (!/(go[- ]live|deadline|by q[1-4]|timeline|milestone)/.test(corpus)) {
      questions.push({
        text: "Is there a fixed go-live date or an external event the delivery must land before?",
        severity: "high",
        category: "delivery",
        blocking: false,
      });
    }
    if (/\b(sap|salesforce|workday|oracle|dynamics|netsuite)\b/.test(corpus)) {
      questions.push({
        text: "For each named enterprise system, which integration interface is available and who owns it?",
        severity: "high",
        category: "integration",
        blocking: false,
      });
    }

    assumptions.push({
      text: "Customer provides environment access, test data and named business owners within two weeks of kickoff.",
      rationale:
        "Standard delivery dependency; absence of it is the most common cause of schedule slip.",
    });

    const risks: unknown[] = [
      {
        title: "Integration interfaces not yet confirmed",
        description:
          "Effort for each integration is estimated from the declared system count rather than confirmed interface contracts.",
        likelihood: "high",
        impact: "medium",
        mitigation:
          "Run an interface discovery workshop before contract signature.",
      },
      {
        title: "Scale characteristics unconfirmed",
        description:
          "Architecture and non-functional testing effort both scale with the concurrency tier, which is currently assumed.",
        likelihood: "medium",
        impact: "high",
        mitigation:
          "Confirm peak concurrent usage and growth profile with the customer.",
      },
    ];

    return { requirements, questions, assumptions, risks };
  }

  async proposeScope(request: ScopeRequest): Promise<unknown> {
    const live = request.model.requirements.filter(
      (r) => r.status !== "rejected" && r.provenance !== "out-of-scope",
    );
    if (live.length === 0) {
      throw new ProviderError(
        "empty-output",
        "There are no live requirements to decompose.",
      );
    }

    const groups = new Map<string, Requirement[]>();
    for (const requirement of live) {
      const list = groups.get(requirement.type) ?? [];
      list.push(requirement);
      groups.set(requirement.type, list);
    }

    const CAPABILITY_NAME: Record<string, string> = {
      functional: "Core business capability",
      "non-functional": "Performance and availability",
      integration: "Enterprise integration",
      data: "Data platform and reporting",
      security: "Security and access control",
      compliance: "Regulatory compliance",
      operational: "Operations and support",
    };

    const capabilities: unknown[] = [];
    const scopeItems: unknown[] = [];
    let capabilityIndex = 0;

    for (const [type, members] of groups) {
      capabilities.push({
        name: CAPABILITY_NAME[type] ?? type,
        summary: `Groups ${members.length} ${type} requirement(s) extracted from customer material.`,
        requirementIds: members.map((m) => m.id),
      });

      // Chunk into deliverable-sized scope items rather than one item per
      // requirement, which produces an unusable delivery plan.
      const chunkSize = Math.max(
        1,
        Math.ceil(members.length / Math.min(3, members.length)),
      );
      for (let i = 0; i < members.length; i += chunkSize) {
        const chunk = members.slice(i, i + chunkSize);
        const first = chunk[0] as Requirement;
        const highest = chunk.some((c) => c.priority === "must")
          ? "must"
          : chunk.some((c) => c.priority === "should")
            ? "should"
            : "could";
        scopeItems.push({
          name: `${CAPABILITY_NAME[type] ?? type} \u2014 ${first.description.split(/\s+/).slice(0, 6).join(" ")}`,
          description: `Delivers ${chunk.length} requirement(s): ${chunk.map((c) => c.id).join(", ")}.`,
          capabilityIndex,
          requirementIds: chunk.map((c) => c.id),
          priority: highest,
        });
      }
      capabilityIndex += 1;
    }

    const exclusions = request.model.requirements
      .filter((r) => r.provenance === "out-of-scope" || r.priority === "wont")
      .map((r) => r.description);

    return { capabilities, scopeItems, exclusions };
  }

  async proposeArchitecture(request: ArchitectureRequest): Promise<unknown> {
    const { model, cloud } = request;
    const catalog = catalogFor(cloud);
    const live = model.requirements.filter((r) => r.status !== "rejected");
    const byType = (type: string) =>
      live.filter((r) => r.type === type).map((r) => r.id);

    const needed: string[] = [
      "cdn",
      "api",
      "compute",
      "oltp",
      "object",
      "identity",
      "observability",
      "secrets",
    ];
    if (model.configuration.externalSystemCount > 0)
      needed.push("queue", "events");
    if (byType("data").length > 0) needed.push("warehouse");
    if (
      model.configuration.concurrencyTier === "enterprise" ||
      model.configuration.concurrencyTier === "internet-scale"
    ) {
      needed.push("cache");
    }
    if (model.configuration.complianceTier !== "standard") needed.push("waf");
    if (
      live.some((r) =>
        /\b(ai|ml|machine learning|assistant|chatbot|predict|recommend)\b/i.test(
          r.description,
        ),
      )
    ) {
      needed.push("ai", "vector");
    }

    const REQUIREMENT_LINK: Record<string, () => string[]> = {
      cdn: () => byType("non-functional"),
      api: () => byType("functional"),
      compute: () => byType("functional"),
      oltp: () => byType("data"),
      warehouse: () => byType("data"),
      cache: () => byType("non-functional"),
      queue: () => byType("integration"),
      events: () => byType("integration"),
      identity: () => byType("security"),
      secrets: () => byType("security"),
      waf: () => [...byType("security"), ...byType("compliance")],
      observability: () => byType("operational"),
      ai: () => byType("functional"),
      vector: () => byType("data"),
      object: () => byType("data"),
    };

    const components = [...new Set(needed)]
      .map((key) => catalog.find((entry) => entry.key === key))
      .filter(
        (entry): entry is NonNullable<typeof entry> => entry !== undefined,
      )
      .map((entry, index) => ({
        id: `CMP-${String(index + 1).padStart(3, "0")}`,
        key: entry.key,
        name: entry.service,
        layer: entry.layer,
        cloudService: entry.service,
        purpose: purposeFor(entry.key),
        rationale: `Selected for the ${entry.layer} layer. ${entry.constraints}`,
        tradeoffs: entry.tradeoffs,
        risks: [entry.constraints],
        securityNotes: securityNotesFor(
          entry.key,
          model.configuration.complianceTier,
        ),
        scalabilityNotes: scalabilityNotesFor(
          entry.key,
          model.configuration.concurrencyTier,
        ),
        deploymentNotes:
          "Provisioned via infrastructure as code with environment promotion through dev, test and production.",
        requirementIds: (REQUIREMENT_LINK[entry.key]?.() ?? []).slice(0, 6),
        provenance: "ai-recommendation",
      }));

    const idOf = (key: string): string | undefined =>
      components.find((c) => c.key === key)?.id;

    const edgeSpec: readonly [string, string, string, string][] = [
      ["cdn", "api", "HTTPS", "sync"],
      ["waf", "api", "Filtered traffic", "control"],
      ["api", "compute", "Routed request", "sync"],
      ["compute", "oltp", "Read/write", "data"],
      ["compute", "cache", "Read-through", "data"],
      ["compute", "queue", "Publish", "async"],
      ["queue", "events", "Fan-out", "async"],
      ["compute", "object", "Document storage", "data"],
      ["compute", "identity", "Token validation", "control"],
      ["compute", "secrets", "Credential fetch", "control"],
      ["compute", "ai", "Inference", "sync"],
      ["ai", "vector", "Retrieval", "data"],
      ["oltp", "warehouse", "Change data capture", "data"],
      ["compute", "observability", "Traces and logs", "control"],
    ];

    const edges = edgeSpec
      .map(([from, to, label, kind]) => {
        const f = idOf(from);
        const t = idOf(to);
        return f && t ? { from: f, to: t, label, kind } : null;
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);

    return {
      cloud,
      summary: `A ${model.configuration.concurrencyTier}-tier deployment on ${cloud.toUpperCase()} sized for ${model.configuration.expectedUsers.toLocaleString("en-US")} expected users, with ${model.configuration.externalSystemCount} external integration point(s) and a ${model.configuration.complianceTier} compliance posture.`,
      components: components.map(({ key: _key, ...rest }) => rest),
      edges,
      crossCuttingConcerns: [
        "All service-to-service traffic stays inside the private network; no component is publicly addressable except the edge tier.",
        "Secrets are never held in environment variables at rest; they are fetched at runtime and cached in memory only.",
        "Every request carries a correlation identifier propagated to logs and traces.",
        model.configuration.complianceTier === "standard"
          ? "Encryption at rest with provider-managed keys."
          : "Encryption at rest with customer-managed keys and a documented key rotation schedule.",
      ],
    };
  }

  async proposeDataStrategy(request: ScopeRequest): Promise<unknown> {
    const model = request.model;
    const dataReqs = model.requirements.filter(
      (r) => r.type === "data" && r.status !== "rejected",
    );
    const complianceReqs = model.requirements.filter(
      (r) => r.type === "compliance",
    );
    const retention =
      model.configuration.complianceTier === "standard"
        ? "24 months"
        : "7 years";

    const domains = [
      {
        name: "Customer and account data",
        owner: "To be confirmed",
        sources: ["Primary application database", "CRM export"],
        storage:
          "Transactional store with change data capture into the warehouse",
        classification:
          model.configuration.complianceTier === "standard"
            ? "internal"
            : "confidential",
        retention,
        requirementIds: dataReqs.slice(0, 3).map((r) => r.id),
        provenance: "ai-recommendation",
      },
      {
        name: "Transactional records",
        owner: "To be confirmed",
        sources: ["Application services"],
        storage: "Partitioned transactional store, archived to object storage",
        classification: "confidential",
        retention,
        requirementIds: dataReqs.slice(3, 6).map((r) => r.id),
        provenance: "ai-recommendation",
      },
      {
        name: "Audit and access logs",
        owner: "Security operations",
        sources: ["Platform audit trail", "Identity provider"],
        storage: "Append-only log store with immutability policy",
        classification: "restricted",
        retention,
        requirementIds: complianceReqs.slice(0, 3).map((r) => r.id),
        provenance:
          complianceReqs.length > 0 ? "customer-stated" : "ai-recommendation",
      },
    ].filter(
      (d) => d.requirementIds.length > 0 || d.name === "Audit and access logs",
    );

    return {
      domains: domains.map((d, i) => ({
        ...d,
        id: `DAT-${String(i + 1).padStart(3, "0")}`,
      })),
      governance: [
        "Each data domain has a named business owner accountable for classification and access decisions.",
        "Schema changes go through a review that records the downstream consumers affected.",
        "Access is granted by role, reviewed quarterly, and revoked automatically on role change.",
      ],
      privacy: [
        "Personal data is identified at the field level and tagged in the catalogue.",
        "Subject access and erasure requests are served from a single documented procedure.",
        model.configuration.complianceTier === "standard"
          ? "Pseudonymisation applied in non-production environments."
          : "Non-production environments receive synthetic data only; no production copy is permitted.",
      ],
      backupRecovery: `Daily full backup with point-in-time recovery. Target RPO 15 minutes, RTO 4 hours. Restore is rehearsed quarterly; an unrehearsed backup is treated as no backup.`,
      reporting:
        "Operational reporting served from read replicas; analytical reporting from the warehouse to keep transactional latency predictable.",
    };
  }

  async proposeIntegrations(request: ScopeRequest): Promise<unknown> {
    const model = request.model;
    const integrationReqs = model.requirements.filter(
      (r) => r.type === "integration" && r.status !== "rejected",
    );
    const named = new Set<string>();
    for (const r of model.requirements) {
      const match =
        /\b(SAP|Salesforce|Workday|Oracle|Dynamics|NetSuite|ServiceNow|Stripe|Twilio)\b/i.exec(
          r.description,
        );
      if (match && match[0]) named.add(match[0]);
    }
    const systems = named.size > 0 ? [...named] : ["Customer system of record"];

    const integrations = systems.map((system, index) => ({
      id: `INT-${String(index + 1).padStart(3, "0")}`,
      name: `${system} integration`,
      sourceSystem: system,
      targetSystem: model.customer.opportunityName || "New platform",
      protocol: /sap|oracle/i.test(system) ? "soap" : "rest",
      direction: "bidirectional",
      authentication:
        "OAuth 2.0 client credentials with short-lived tokens; credentials held in the secret store.",
      errorHandling:
        "Failed messages are dead-lettered with the correlation id and the upstream payload retained for replay.",
      retryBehaviour:
        "Exponential backoff, three attempts, jittered. Consumers are idempotent because delivery is at-least-once.",
      monitoring:
        "Per-integration success rate, latency percentiles and dead-letter depth, alerting on sustained failure.",
      requirementIds: integrationReqs
        .slice(index * 2, index * 2 + 2)
        .map((r) => r.id),
      provenance:
        integrationReqs.length > 0 ? "customer-stated" : "ai-recommendation",
    }));

    return { integrations };
  }

  async proposeAiStrategy(request: ScopeRequest): Promise<unknown> {
    const model = request.model;
    const aiSignals = model.requirements.filter((r) =>
      /\b(ai|ml|machine learning|assistant|chatbot|predict|recommend|classif|summar|search)\b/i.test(
        r.description,
      ),
    );

    const useCases = aiSignals.slice(0, 4).map((requirement, index) => ({
      id: `AIU-${String(index + 1).padStart(3, "0")}`,
      name: requirement.description.split(/\s+/).slice(0, 8).join(" "),
      description: `Derived from ${requirement.id}. ${requirement.description.slice(0, 200)}`,
      pattern: /search|retriev|knowledge|document/i.test(
        requirement.description,
      )
        ? "rag"
        : /classif|categor|route/i.test(requirement.description)
          ? "classification"
          : /extract|parse/i.test(requirement.description)
            ? "extraction"
            : /summar/i.test(requirement.description)
              ? "summarisation"
              : "agent",
      dataRequirements: [
        "Representative labelled sample for evaluation",
        "Access to the source corpus with the same permissions as end users",
      ],
      humanReview:
        "Outputs that affect a customer-visible decision require human confirmation before they take effect.",
      evaluation:
        "A held-out evaluation set scored before each release; regressions block promotion.",
      requirementIds: [requirement.id],
      provenance: "ai-recommendation",
    }));

    return {
      useCases,
      modelOptions: [
        "Hosted frontier model through the selected cloud provider, keeping data inside the existing trust boundary.",
        "Smaller task-specific model for high-volume classification where latency and unit cost dominate.",
        "No model at all where a deterministic rule performs the task; the cheapest AI is the one not deployed.",
      ],
      responsibleAi: [
        "Every AI-produced field is labelled as such in the user interface and never presented as a confirmed fact.",
        "Prompts and responses are logged with retention matching the data classification of their inputs.",
        "A documented escalation path exists for users who dispute an AI-produced output.",
        "Evaluation covers refusal behaviour and prompt injection resistance, not only task accuracy.",
      ],
      monitoring: [
        "Token consumption and unit cost per use case, alerting on sustained deviation.",
        "Output schema validation failure rate as a leading indicator of model drift.",
        "Human override rate per use case as the primary quality signal.",
      ],
    };
  }

  async proposeWorkstreams(request: WorkstreamRequest): Promise<unknown> {
    const model = request.model;
    const items = model.scopeItems.filter((i) => i.status !== "rejected");
    if (items.length === 0) {
      throw new ProviderError(
        "empty-output",
        "There is no approved functional scope to build workstreams from.",
      );
    }

    const byCapability = new Map<string, typeof items>();
    for (const item of items) {
      const list = byCapability.get(item.capabilityId) ?? [];
      list.push(item);
      byCapability.set(item.capabilityId, list);
    }

    const workstreams: unknown[] = [];
    let index = 0;

    // Discovery always leads and everything else depends on it.
    workstreams.push({
      id: "WS-001",
      name: "Discovery and solution design",
      description:
        "Confirm requirements, interface contracts and non-functional targets; produce the design baseline.",
      band: items.length > 12 ? "L" : "M",
      bandRationale: `Sized from ${items.length} scope item(s) across ${byCapability.size} capability group(s), each needing a confirmed design decision.`,
      drivers: [
        `${items.length} scope items`,
        `${byCapability.size} capability groups`,
      ],
      requirementIds: [
        ...new Set(items.flatMap((i) => i.requirementIds)),
      ].slice(0, 12),
      dependencies: [],
      roleMix: {
        "solution-architect": 0.45,
        "tech-lead": 0.25,
        "project-manager": 0.3,
      },
      priority: "must",
    });
    index = 1;

    for (const [capabilityId, members] of byCapability) {
      index += 1;
      const capability = model.capabilities.find((c) => c.id === capabilityId);
      const requirementIds = [
        ...new Set(members.flatMap((m) => m.requirementIds)),
      ];
      const band =
        requirementIds.length >= 8
          ? "XL"
          : requirementIds.length >= 5
            ? "L"
            : requirementIds.length >= 2
              ? "M"
              : "S";
      workstreams.push({
        id: `WS-${String(index).padStart(3, "0")}`,
        name: `Build \u2014 ${capability?.name ?? capabilityId}`,
        description: `Implements ${members.length} scope item(s) in this capability group.`,
        band,
        bandRationale: `${requirementIds.length} requirement(s) across ${members.length} scope item(s); band assigned from the requirement count thresholds shown in the rate card.`,
        drivers: [
          `${requirementIds.length} requirements`,
          `${members.length} scope items`,
        ],
        requirementIds,
        dependencies: ["WS-001"],
        roleMix: { "tech-lead": 0.2, engineer: 0.55, qa: 0.25 },
        priority: members.some((m) => m.priority === "must")
          ? "must"
          : "should",
      });
    }

    const buildIds = (workstreams as { id: string }[])
      .slice(1)
      .map((w) => w.id);

    index += 1;
    workstreams.push({
      id: `WS-${String(index).padStart(3, "0")}`,
      name: "Integration and data migration",
      description:
        "Build and certify the integration inventory, and migrate reference and transactional data.",
      band:
        model.configuration.externalSystemCount >= 4
          ? "XL"
          : model.configuration.externalSystemCount >= 2
            ? "L"
            : "M",
      bandRationale: `${model.configuration.externalSystemCount} external system(s), each requiring interface agreement, error handling and replay.`,
      drivers: [
        `${model.configuration.externalSystemCount} external systems`,
        `data complexity: ${model.configuration.dataComplexity}`,
      ],
      requirementIds: model.requirements
        .filter((r) => r.type === "integration" || r.type === "data")
        .map((r) => r.id)
        .slice(0, 10),
      dependencies: ["WS-001"],
      roleMix: {
        "tech-lead": 0.15,
        engineer: 0.35,
        "data-engineer": 0.35,
        qa: 0.15,
      },
      priority: "must",
    });
    const integrationId = `WS-${String(index).padStart(3, "0")}`;

    index += 1;
    workstreams.push({
      id: `WS-${String(index).padStart(3, "0")}`,
      name: "Non-functional and security validation",
      description:
        "Performance, load, resilience and security testing against the agreed non-functional targets.",
      band:
        model.configuration.concurrencyTier === "internet-scale"
          ? "XL"
          : model.configuration.concurrencyTier === "enterprise"
            ? "L"
            : "M",
      bandRationale: `Sized from the ${model.configuration.concurrencyTier} concurrency tier and the ${model.configuration.complianceTier} compliance posture.`,
      drivers: [
        `concurrency tier: ${model.configuration.concurrencyTier}`,
        `compliance tier: ${model.configuration.complianceTier}`,
      ],
      requirementIds: model.requirements
        .filter(
          (r) =>
            r.type === "non-functional" ||
            r.type === "security" ||
            r.type === "compliance",
        )
        .map((r) => r.id)
        .slice(0, 10),
      dependencies: buildIds.length > 0 ? buildIds : ["WS-001"],
      roleMix: { "solution-architect": 0.2, engineer: 0.3, qa: 0.5 },
      priority: "must",
    });

    index += 1;
    workstreams.push({
      id: `WS-${String(index).padStart(3, "0")}`,
      name: "Deployment, cutover and hypercare",
      description:
        "Environment provisioning, release automation, production cutover and two weeks of hypercare.",
      band: "M",
      bandRationale:
        "Fixed-shape workstream; scales with environment count rather than requirement count.",
      drivers: ["three environments", "two weeks hypercare"],
      requirementIds: model.requirements
        .filter((r) => r.type === "operational")
        .map((r) => r.id)
        .slice(0, 8),
      dependencies: [integrationId, `WS-${String(index - 1).padStart(3, "0")}`],
      roleMix: { "tech-lead": 0.3, engineer: 0.4, "project-manager": 0.3 },
      priority: "must",
    });

    return { workstreams };
  }
}

function purposeFor(key: string): string {
  const purposes: Record<string, string> = {
    cdn: "Terminates client connections at the edge and serves cached static assets close to users.",
    waf: "Filters malicious traffic before it reaches the application tier.",
    api: "Publishes the versioned public interface and enforces rate limits and request validation.",
    compute: "Runs the application services that implement business logic.",
    queue:
      "Decouples the application from slow or unreliable downstream systems.",
    events:
      "Distributes domain events to interested consumers without point-to-point coupling.",
    oltp: "Holds the transactional system of record.",
    cache:
      "Absorbs read traffic that would otherwise reach the transactional store.",
    object:
      "Stores documents and large binary content outside the transactional store.",
    warehouse:
      "Serves analytical queries without competing with transactional workload.",
    ai: "Provides model inference within the existing trust boundary.",
    vector: "Stores embeddings for retrieval-augmented generation.",
    identity: "Authenticates users and issues tokens carrying role claims.",
    secrets: "Holds credentials and rotates them without redeployment.",
    observability:
      "Collects logs, metrics and traces for operational diagnosis.",
  };
  return purposes[key] ?? "Supports the solution architecture.";
}

function securityNotesFor(key: string, tier: string): string {
  if (key === "identity" || key === "secrets" || key === "waf") {
    return tier === "standard"
      ? "Provider-managed keys; access audited through the platform audit trail."
      : "Customer-managed keys with a documented rotation schedule; all access recorded in an immutable audit log.";
  }
  return tier === "standard"
    ? "Encryption in transit and at rest with provider-managed keys; no public network exposure."
    : "Encryption in transit and at rest with customer-managed keys; private networking enforced and egress restricted by policy.";
}

function scalabilityNotesFor(key: string, tier: string): string {
  if (key === "oltp") {
    return tier === "internet-scale" || tier === "enterprise"
      ? "Single-writer topology is the binding constraint at this tier. Read replicas absorb reads; write scaling requires partitioning and must be designed before build."
      : "Single writer with read replicas is sufficient at this tier.";
  }
  if (key === "compute") {
    return `Horizontal autoscaling on request concurrency, sized for the ${tier} tier with headroom for a 3x burst.`;
  }
  return `Sized for the ${tier} concurrency tier; revisit if the tier changes.`;
}
