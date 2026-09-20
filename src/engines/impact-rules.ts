import { ArtifactKind } from "../domain/artifacts";

export type ImpactSeverity = "high" | "medium" | "low";

export interface ImpactRule {
  readonly id: string;
  readonly trigger: string;
  readonly direction: "any" | "increase" | "decrease";
  readonly affects: ArtifactKind | "assumptions";
  readonly scope: string;
  readonly severity: ImpactSeverity;
  readonly reason: string;
}

export const IMPACT_RULES: readonly ImpactRule[] = [
  {
    id: "IR-SCALE-01",
    trigger: "configuration.concurrencyTier",
    direction: "increase",
    affects: "architecture",
    scope: "Compute and data tier",
    severity: "high",
    reason:
      "Instance sizing and the single-writer database topology were justified by the previous concurrency tier.",
  },
  {
    id: "IR-SCALE-02",
    trigger: "configuration.concurrencyTier",
    direction: "increase",
    affects: "estimate",
    scope: "Non-functional testing workstream",
    severity: "high",
    reason:
      "Load and performance testing effort scales with the target concurrency band.",
  },
  {
    id: "IR-SCALE-03",
    trigger: "configuration.concurrencyTier",
    direction: "increase",
    affects: "data-strategy",
    scope: "Partitioning and caching",
    severity: "medium",
    reason:
      "Read-replica and cache strategy were sized against the superseded user figure.",
  },
  {
    id: "IR-SCALE-04",
    trigger: "configuration.concurrencyTier",
    direction: "any",
    affects: "assumptions",
    scope: "Volume assumptions",
    severity: "medium",
    reason: "Approved assumptions that cite user volume must be revalidated.",
  },
  {
    id: "IR-CLOUD-01",
    trigger: "configuration.cloud",
    direction: "any",
    affects: "architecture",
    scope: "All cloud services",
    severity: "high",
    reason:
      "Every selected service is provider-specific and must be reselected.",
  },
  {
    id: "IR-CLOUD-02",
    trigger: "configuration.cloud",
    direction: "any",
    affects: "data-strategy",
    scope: "Storage and backup services",
    severity: "medium",
    reason: "Storage, backup and recovery services are named per provider.",
  },
  {
    id: "IR-COMPLIANCE-01",
    trigger: "configuration.complianceTier",
    direction: "any",
    affects: "architecture",
    scope: "Security controls",
    severity: "high",
    reason:
      "Encryption, isolation and audit controls are selected from the compliance tier.",
  },
  {
    id: "IR-COMPLIANCE-02",
    trigger: "configuration.complianceTier",
    direction: "any",
    affects: "estimate",
    scope: "Security multiplier",
    severity: "high",
    reason:
      "The security factor applied to every workstream is derived from the compliance tier.",
  },
  {
    id: "IR-COMPLIANCE-03",
    trigger: "configuration.complianceTier",
    direction: "increase",
    affects: "data-strategy",
    scope: "Retention and classification",
    severity: "medium",
    reason:
      "Retention periods and data classification tighten with the compliance tier.",
  },
  {
    id: "IR-INTEGRATION-01",
    trigger: "configuration.externalSystemCount",
    direction: "any",
    affects: "integration-architecture",
    scope: "Integration inventory",
    severity: "high",
    reason:
      "The integration inventory is sized directly from the external system count.",
  },
  {
    id: "IR-INTEGRATION-02",
    trigger: "configuration.externalSystemCount",
    direction: "any",
    affects: "estimate",
    scope: "Integration multiplier",
    severity: "medium",
    reason:
      "The integration factor applied to every workstream changes with the system count.",
  },
  {
    id: "IR-DATA-01",
    trigger: "configuration.dataComplexity",
    direction: "any",
    affects: "estimate",
    scope: "Data complexity multiplier",
    severity: "medium",
    reason:
      "The data complexity factor is an input to every workstream calculation.",
  },
  {
    id: "IR-COMMERCIAL-01",
    trigger: "configuration.contingency",
    direction: "any",
    affects: "estimate",
    scope: "ROM range",
    severity: "low",
    reason:
      "Contingency is applied to the ROM after cost, so only the commercial range moves.",
  },
  {
    id: "IR-COMMERCIAL-02",
    trigger: "configuration.currency",
    direction: "any",
    affects: "estimate",
    scope: "Rate basis",
    severity: "low",
    reason:
      "A different rate card applies; effort is unchanged but cost is not comparable.",
  },
  {
    id: "IR-COMMERCIAL-03",
    trigger: "configuration.productivityFactor",
    direction: "any",
    affects: "estimate",
    scope: "All workstreams",
    severity: "medium",
    reason:
      "Productivity is a divisor on every workstream, so all effort figures move.",
  },
  {
    id: "IR-CAPACITY-01",
    trigger: "configuration.teamCapacity",
    direction: "any",
    affects: "estimate",
    scope: "Timeline only",
    severity: "low",
    reason:
      "Capacity changes the schedule; it does not change total effort or cost.",
  },
  {
    id: "IR-REQ-01",
    trigger: "requirements.description",
    direction: "any",
    affects: "prd",
    scope: "Requirement narrative",
    severity: "high",
    reason: "The PRD quotes requirement text directly.",
  },
  {
    id: "IR-REQ-02",
    trigger: "requirements.description",
    direction: "any",
    affects: "functional-scope",
    scope: "Covering scope items",
    severity: "high",
    reason:
      "Scope items that declare this requirement may no longer describe it correctly.",
  },
  {
    id: "IR-REQ-03",
    trigger: "requirements.priority",
    direction: "any",
    affects: "functional-scope",
    scope: "Delivery packaging",
    severity: "medium",
    reason: "Delivery packages are grouped by priority.",
  },
  {
    id: "IR-REQ-04",
    trigger: "requirements.status",
    direction: "any",
    affects: "functional-scope",
    scope: "Coverage",
    severity: "high",
    reason:
      "A rejected requirement must not remain covered by an approved scope item.",
  },
] as const;

export function rulesFor(fieldPath: string): readonly ImpactRule[] {
  return IMPACT_RULES.filter((r) => r.trigger === fieldPath);
}
