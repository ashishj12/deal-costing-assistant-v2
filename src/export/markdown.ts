import { PACKAGE_DISCLAIMER, PackageModel } from "./package-model";
import { formatCurrency } from "../engines/estimation";
import { PROVENANCE_LABEL } from "../domain/provenance";
import { CLOUD_LABEL } from "../engines/cloud-catalog";
import { GATE_LABEL } from "../engines/quality-gate";
import { ROLE_LABEL, Role } from "../engines/rates";

const nl = (lines: (string | null)[]): string =>
  lines.filter((l): l is string => l !== null).join("\n");

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return "_No entries._";
  return nl([
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map(
      (r) =>
        `| ${r.map((c) => c.replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`,
    ),
  ]);
}

export function renderPackageMarkdown(pkg: PackageModel): string {
  const m = pkg.model;
  const out: string[] = [];

  out.push(`# ${m.customer.opportunityName || m.projectName}`);
  out.push("");
  out.push(`**Customer:** ${m.customer.customerName || "Not stated"}  `);
  out.push(`**Industry:** ${m.customer.industry || "Not stated"}  `);
  out.push(`**Scope model version:** v${m.version}  `);
  out.push(
    `**Quality gate:** ${GATE_LABEL[pkg.quality.status]} (${pkg.quality.blocking} blocking, ${pkg.quality.warnings} warning)  `,
  );
  out.push(`**Generated:** ${pkg.generatedAt}`);
  out.push("");
  out.push(`> ${PACKAGE_DISCLAIMER}`);
  out.push("");

  if (pkg.quality.status === "BLOCKED") {
    out.push("## Validation status");
    out.push("");
    out.push(
      "**This package has unresolved blocking issues and must not be treated as validated.**",
    );
    out.push("");
    out.push(
      table(
        ["Check", "Issue", "Action"],
        pkg.quality.checks
          .filter((c) => c.severity === "blocking")
          .map((c) => [c.checkId, c.title, c.recommendedAction]),
      ),
    );
    out.push("");
  }

  out.push("## Executive summary");
  out.push("");
  out.push(
    pkg.prd?.executiveSummary ??
      "The product requirements document has not been generated, so no executive summary is available.",
  );
  out.push("");

  out.push("## Customer objectives");
  out.push("");
  out.push(
    m.customer.businessObjectives.length > 0
      ? m.customer.businessObjectives.map((o) => `- ${o}`).join("\n")
      : "_No business objectives were captured._",
  );
  out.push("");

  out.push("## Requirement summary");
  out.push("");
  out.push(
    table(
      ["ID", "Type", "Priority", "Origin", "Status", "Description"],
      m.requirements.map((r) => [
        r.id,
        r.type,
        r.priority,
        PROVENANCE_LABEL[r.provenance] +
          (r.provenance === "customer-stated" && !r.citationResolved
            ? " (unresolved citation)"
            : ""),
        r.status,
        r.description.length > 160
          ? `${r.description.slice(0, 157)}...`
          : r.description,
      ]),
    ),
  );
  out.push("");

  if (pkg.prd) {
    out.push("## Product requirements document");
    out.push("");
    for (const section of pkg.prd.sections) {
      out.push(`### ${section.heading}`);
      out.push("");
      out.push(section.body);
      if (section.requirementIds.length > 0) {
        out.push("");
        out.push(`_Derived from: ${section.requirementIds.join(", ")}_`);
      }
      out.push("");
    }
  }

  if (pkg.functionalScope) {
    out.push("## Functional scope");
    out.push("");
    for (const pack of pkg.functionalScope.packages) {
      out.push(`### ${pack.name}`);
      out.push("");
      out.push(
        table(
          ["Scope item", "Name", "Covers", "Status"],
          pack.scopeItemIds.map((id) => {
            const item = m.scopeItems.find((i) => i.id === id);
            return [
              id,
              item?.name ?? "(missing)",
              item?.requirementIds.join(", ") ?? "",
              item?.status ?? "",
            ];
          }),
        ),
      );
      out.push("");
    }
    if (pkg.functionalScope.exclusions.length > 0) {
      out.push("### Explicitly out of scope");
      out.push("");
      out.push(pkg.functionalScope.exclusions.map((e) => `- ${e}`).join("\n"));
      out.push("");
    }
  }

  if (pkg.architecture) {
    out.push("## Solution architecture");
    out.push("");
    out.push(`**Cloud:** ${CLOUD_LABEL[pkg.architecture.cloud]}`);
    out.push("");
    out.push(pkg.architecture.summary);
    out.push("");
    out.push(
      table(
        ["ID", "Component", "Layer", "Service", "Justified by"],
        pkg.architecture.components.map((c) => [
          c.id,
          c.name,
          c.layer,
          c.cloudService,
          c.requirementIds.length > 0
            ? c.requirementIds.join(", ")
            : "No linked requirement",
        ]),
      ),
    );
    out.push("");
    out.push("### Architecture diagram");
    out.push("");
    out.push("```mermaid");
    out.push(renderMermaid(pkg));
    out.push("```");
    out.push("");
    if (pkg.architecture.crossCuttingConcerns.length > 0) {
      out.push("### Cross-cutting concerns");
      out.push("");
      out.push(
        pkg.architecture.crossCuttingConcerns.map((c) => `- ${c}`).join("\n"),
      );
      out.push("");
    }
  }

  if (pkg.dataStrategy) {
    out.push("## Data strategy");
    out.push("");
    out.push(
      table(
        [
          "ID",
          "Domain",
          "Owner",
          "Classification",
          "Retention",
          "Requirements",
        ],
        pkg.dataStrategy.domains.map((d) => [
          d.id,
          d.name,
          d.owner,
          d.classification,
          d.retention || "Not stated",
          d.requirementIds.join(", ") || "None linked",
        ]),
      ),
    );
    out.push("");
    out.push(`**Backup and recovery.** ${pkg.dataStrategy.backupRecovery}`);
    out.push("");
    out.push(`**Reporting.** ${pkg.dataStrategy.reporting}`);
    out.push("");
  }

  if (pkg.integrations) {
    out.push("## Integration architecture");
    out.push("");
    out.push(
      table(
        ["ID", "Integration", "Source", "Target", "Protocol", "Requirements"],
        pkg.integrations.integrations.map((i) => [
          i.id,
          i.name,
          i.sourceSystem,
          i.targetSystem,
          i.protocol.toUpperCase(),
          i.requirementIds.join(", ") || "None linked",
        ]),
      ),
    );
    out.push("");
  }

  if (pkg.aiStrategy) {
    out.push("## AI strategy");
    out.push("");
    out.push(
      table(
        ["ID", "Use case", "Pattern", "Human review", "Requirements"],
        pkg.aiStrategy.useCases.map((u) => [
          u.id,
          u.name,
          u.pattern,
          u.humanReview,
          u.requirementIds.join(", ") || "None linked",
        ]),
      ),
    );
    out.push("");
    out.push("### Responsible AI");
    out.push("");
    out.push(pkg.aiStrategy.responsibleAi.map((r) => `- ${r}`).join("\n"));
    out.push("");
  }

  if (pkg.estimate) {
    const e = pkg.estimate;
    const cur = e.totals.currency;
    out.push("## Effort, timeline and ROM");
    out.push("");
    out.push(
      table(
        [
          "Workstream",
          "Band",
          "Base h",
          "Adjusted h",
          "Low h",
          "High h",
          "Cost",
        ],
        e.workstreams.map((w) => [
          `${w.workstreamId} ${w.name}`,
          w.band,
          String(w.baseHours),
          String(w.adjustedHours),
          String(w.lowHours),
          String(w.highHours),
          formatCurrency(w.cost, cur),
        ]),
      ),
    );
    out.push("");
    out.push(
      `**Effort range.** ${e.totals.lowHours} to ${e.totals.highHours} hours.`,
    );
    out.push("");
    out.push(
      `**Timeline.** ${e.timeline.weeksLow} to ${e.timeline.weeksHigh} weeks at a capacity of ${e.timeline.capacityHoursPerWeek} hours per week. Critical path: ${e.timeline.criticalPathIds.join(" \u2192 ")}.`,
    );
    out.push("");
    out.push(
      `**ROM range.** ${formatCurrency(e.totals.romLow, cur)} to ${formatCurrency(e.totals.romHigh, cur)}, including ${Math.round(e.totals.contingency * 100)}% contingency. Rate card ${e.totals.rateCardVersion}.`,
    );
    out.push("");
    out.push("### Rate basis");
    out.push("");
    out.push(
      table(
        ["Role", `Hourly rate (${cur})`],
        Object.entries(e.rates).map(([role, rate]) => [
          ROLE_LABEL[role as Role] ?? role,
          String(rate),
        ]),
      ),
    );
    out.push("");
    out.push("### Confidence");
    out.push("");
    out.push(
      table(
        ["Input", "Value"],
        [
          ["Requirement grounding", pct(e.confidence.grounding)],
          [
            "Blocking question resolution",
            pct(e.confidence.questionResolution),
          ],
          ["Assumption validation", pct(e.confidence.assumptionValidation)],
          ["Mandatory coverage", pct(e.confidence.coverage)],
          [
            "Weighted score",
            `${pct(e.confidence.score)} (${e.confidence.label})`,
          ],
        ],
      ),
    );
    out.push("");
    out.push("### Exclusions");
    out.push("");
    out.push(e.exclusions.map((x) => `- ${x}`).join("\n"));
    out.push("");
  }

  out.push("## Assumptions");
  out.push("");
  out.push(
    table(
      ["ID", "Assumption", "Owner", "Status"],
      m.assumptions.map((a) => [a.id, a.text, a.owner, a.status]),
    ),
  );
  out.push("");

  out.push("## Risks");
  out.push("");
  out.push(
    table(
      ["ID", "Risk", "Likelihood", "Impact", "Mitigation"],
      m.risks.map((r) => [r.id, r.title, r.likelihood, r.impact, r.mitigation]),
    ),
  );
  out.push("");

  out.push("## Open questions");
  out.push("");
  out.push(
    table(
      ["ID", "Question", "Severity", "Blocking", "Resolved", "Answer"],
      m.questions.map((q) => [
        q.id,
        q.text,
        q.severity,
        q.blocking ? "Yes" : "No",
        q.resolved ? "Yes" : "No",
        q.answer || "",
      ]),
    ),
  );
  out.push("");

  out.push("## Requirement coverage");
  out.push("");
  out.push(
    `${pkg.coverage.covered} covered, ${pkg.coverage.weak} weakly covered, ${pkg.coverage.uncovered} uncovered, of ${pkg.coverage.inScopeTotal} in-scope requirements.`,
  );
  out.push("");
  out.push(
    table(
      ["Requirement", "State", "Covered by", "Note"],
      pkg.coverage.rows.map((r) => [
        r.requirementId,
        r.state,
        r.scopeItemIds.join(", ") || "-",
        r.reason,
      ]),
    ),
  );
  out.push("");

  out.push("## Traceability");
  out.push("");
  out.push(
    table(
      ["Requirement", "Scope items", "Architecture components", "Workstreams"],
      m.requirements.map((r) => [
        r.id,
        m.scopeItems
          .filter((i) => i.requirementIds.includes(r.id))
          .map((i) => i.id)
          .join(", ") || "-",
        pkg.architecture?.components
          .filter((c) => c.requirementIds.includes(r.id))
          .map((c) => c.id)
          .join(", ") || "-",
        pkg.estimate?.workstreams
          .filter((w) => w.requirementIds.includes(r.id))
          .map((w) => w.workstreamId)
          .join(", ") || "-",
      ]),
    ),
  );
  out.push("");

  if (pkg.lastImpact) {
    out.push("## Change impact summary");
    out.push("");
    out.push(
      `Change: ${pkg.lastImpact.changeSet.summary} (v${pkg.lastImpact.changeSet.previousVersion} to v${pkg.lastImpact.changeSet.version}).`,
    );
    out.push("");
    out.push(
      table(
        ["Artifact", "Severity", "Rules fired", "Reason"],
        pkg.lastImpact.affected.map((a) => [
          a.label,
          a.severity,
          a.ruleIds.join(", "),
          a.reasons.join(" "),
        ]),
      ),
    );
    out.push("");
    if (pkg.lastImpact.confirmedCurrent.length > 0) {
      out.push(
        "Confirmed unaffected: " +
          pkg.lastImpact.confirmedCurrent.map((c) => c.label).join(", ") +
          ".",
      );
      out.push("");
    }
  }

  out.push("## Quality status");
  out.push("");
  out.push(
    table(
      ["Check", "Severity", "Detail", "Action"],
      pkg.quality.checks.map((c) => [
        c.checkId,
        c.severity,
        c.description,
        c.recommendedAction || "-",
      ]),
    ),
  );
  out.push("");
  out.push("---");
  out.push("");
  out.push(PACKAGE_DISCLAIMER);
  out.push("");

  return out.join("\n");
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Mermaid source derived from the same typed graph the canvas renders. */
export function renderMermaid(pkg: PackageModel): string {
  if (!pkg.architecture)
    return "flowchart LR\n  empty[No architecture generated]";
  const lines = ["flowchart LR"];
  const layers = new Map<string, typeof pkg.architecture.components>();
  for (const component of pkg.architecture.components) {
    const list = layers.get(component.layer) ?? [];
    list.push(component);
    layers.set(component.layer, list);
  }
  for (const [layer, components] of layers) {
    lines.push(`  subgraph ${layer}[${layer}]`);
    for (const c of components) {
      lines.push(`    ${c.id}["${c.name.replace(/"/g, "'")}"]`);
    }
    lines.push("  end");
  }
  for (const edge of pkg.architecture.edges) {
    const arrow = edge.kind === "async" ? "-.->" : "-->";
    lines.push(
      `  ${edge.from} ${arrow}|${edge.label.replace(/[|"]/g, "")}| ${edge.to}`,
    );
  }
  return lines.join("\n");
}
