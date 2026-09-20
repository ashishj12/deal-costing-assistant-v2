import { ScopeModel } from "../domain/entities";
import {
  FunctionalScopeArtifact,
  PrdArtifact,
  PrdSection,
} from "../domain/artifacts";
import { artifactId } from "../domain/ids";
import { computeCoverage } from "./coverage";

export function buildPrd(model: ScopeModel): PrdArtifact {
  const live = model.requirements.filter(
    (r) => r.status !== "rejected" && r.provenance !== "out-of-scope",
  );
  const byType = (type: string) => live.filter((r) => r.type === type);
  const sections: PrdSection[] = [];

  const objectives = model.customer.businessObjectives;
  sections.push({
    id: "context",
    heading: "Business context and objectives",
    body:
      objectives.length > 0
        ? `${model.customer.customerName} is pursuing ${model.customer.opportunityName}. Stated objectives:\n${objectives.map((o) => `- ${o}`).join("\n")}`
        : `${model.customer.customerName} is pursuing ${model.customer.opportunityName}. No business objectives were stated in the supplied material; this section is incomplete until they are confirmed.`,
    requirementIds: [],
    provenance: objectives.length > 0 ? "customer-stated" : "ai-inferred",
  });

  const TYPE_SECTIONS: readonly {
    id: string;
    type: string;
    heading: string;
    intro: string;
  }[] = [
    {
      id: "functional",
      type: "functional",
      heading: "Functional requirements",
      intro: "Capabilities the solution must provide.",
    },
    {
      id: "nfr",
      type: "non-functional",
      heading: "Non-functional requirements",
      intro:
        "Performance, availability and scale characteristics the solution must meet.",
    },
    {
      id: "integration",
      type: "integration",
      heading: "Integration requirements",
      intro: "Interfaces with systems outside the solution boundary.",
    },
    {
      id: "data",
      type: "data",
      heading: "Data requirements",
      intro: "Data the solution stores, transforms or reports on.",
    },
    {
      id: "security",
      type: "security",
      heading: "Security requirements",
      intro: "Access control and protection requirements.",
    },
    {
      id: "compliance",
      type: "compliance",
      heading: "Compliance requirements",
      intro: "Regulatory and audit obligations.",
    },
    {
      id: "operational",
      type: "operational",
      heading: "Operational requirements",
      intro: "Requirements covering run, support and recovery.",
    },
  ];

  for (const spec of TYPE_SECTIONS) {
    const members = byType(spec.type);
    if (members.length === 0) continue;
    sections.push({
      id: spec.id,
      heading: spec.heading,
      body: `${spec.intro}\n\n${members
        .map((r) => `**${r.id}** (${r.priority}) \u2014 ${r.description}`)
        .join("\n\n")}`,
      requirementIds: members.map((r) => r.id),
      provenance: members.every((r) => r.provenance === "customer-stated")
        ? "customer-stated"
        : "ai-inferred",
    });
  }

  const assumptions = model.assumptions.filter((a) => a.status !== "rejected");
  if (assumptions.length > 0) {
    sections.push({
      id: "assumptions",
      heading: "Assumptions",
      body: assumptions
        .map(
          (a) =>
            `**${a.id}** (${a.status}, owner: ${a.owner}) \u2014 ${a.text}${a.rationale ? `\n\n_${a.rationale}_` : ""}`,
        )
        .join("\n\n"),
      requirementIds: [
        ...new Set(assumptions.flatMap((a) => a.affectedRequirementIds)),
      ],
      provenance: "user-assumption",
    });
  }

  const open = model.questions.filter((q) => !q.resolved);
  if (open.length > 0) {
    sections.push({
      id: "open-questions",
      heading: "Open questions",
      body: open
        .map(
          (q) =>
            `**${q.id}** (${q.severity}${q.blocking ? ", blocking" : ""}) \u2014 ${q.text}`,
        )
        .join("\n\n"),
      requirementIds: [
        ...new Set(open.flatMap((q) => q.relatedRequirementIds)),
      ],
      provenance: "ai-inferred",
    });
  }

  const excluded = model.requirements.filter(
    (r) => r.provenance === "out-of-scope" || r.priority === "wont",
  );
  if (excluded.length > 0) {
    sections.push({
      id: "exclusions",
      heading: "Explicitly out of scope",
      body: excluded.map((r) => `- ${r.description}`).join("\n"),
      requirementIds: excluded.map((r) => r.id),
      provenance: "out-of-scope",
    });
  }

  const coverage = computeCoverage(model);
  const customerCount = live.filter(
    (r) => r.provenance === "customer-stated" && r.citationResolved,
  ).length;

  return {
    meta: {
      artifactId: artifactId("prd", model.version),
      kind: "prd",
      scopeModelVersion: model.version,
      requirementIds: live.map((r) => r.id),
      assumptionIds: assumptions.map((a) => a.id),
      generatedAt: new Date().toISOString(),
      generatedBy: "deterministic",
      promptVersion: "v1",
      status: "in-review",
      stale: false,
      staleReason: "",
    },
    title: `${model.customer.opportunityName} \u2014 product requirements`,
    executiveSummary: [
      `${live.length} in-scope requirement(s) were captured for ${model.customer.customerName}`,
      `${customerCount} of which are traceable to a resolved citation in customer material.`,
      `${coverage.covered} of ${coverage.inScopeTotal} are covered by an approved scope item.`,
      open.filter((q) => q.blocking).length > 0
        ? `${open.filter((q) => q.blocking).length} blocking question(s) remain open and constrain the confidence of everything downstream.`
        : "No blocking questions remain open.",
    ].join(" "),
    sections:
      sections.length > 0
        ? sections
        : [
            {
              id: "empty",
              heading: "No content",
              body: "No requirements have been captured yet.",
              requirementIds: [],
              provenance: "ai-inferred",
            },
          ],
  };
}

export function buildFunctionalScope(
  model: ScopeModel,
): FunctionalScopeArtifact {
  const byPriority = new Map<string, string[]>();
  for (const item of model.scopeItems) {
    const list = byPriority.get(item.priority) ?? [];
    list.push(item.id);
    byPriority.set(item.priority, list);
  }

  const PACKAGE_NAME: Record<string, string> = {
    must: "Release 1 \u2014 mandatory scope",
    should: "Release 2 \u2014 expected scope",
    could: "Backlog \u2014 optional scope",
    wont: "Deferred",
  };

  const packages = [...byPriority.entries()].map(([priority, ids]) => ({
    id: `PKG-${priority.toUpperCase()}`,
    name: PACKAGE_NAME[priority] ?? priority,
    description: `${ids.length} scope item(s) grouped by delivery priority.`,
    scopeItemIds: ids,
  }));

  return {
    meta: {
      artifactId: artifactId("functional-scope", model.version),
      kind: "functional-scope",
      scopeModelVersion: model.version,
      requirementIds: [
        ...new Set(model.scopeItems.flatMap((i) => i.requirementIds)),
      ],
      assumptionIds: [],
      generatedAt: new Date().toISOString(),
      generatedBy: "deterministic",
      promptVersion: "v1",
      status: "in-review",
      stale: false,
      staleReason: "",
    },
    packages,
    exclusions: model.requirements
      .filter((r) => r.provenance === "out-of-scope" || r.priority === "wont")
      .map((r) => r.description),
  };
}
