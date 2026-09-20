import { el } from "../dom";
import { Store } from "../state";
import {
  alert,
  block,
  button,
  chip,
  emptyState,
  idLink,
  statusChip,
} from "../components/primitives";
import { GATE_LABEL } from "../../engines/quality-gate";
import { formatCurrency } from "../../engines/estimation";

interface Cell {
  k: string;
  v: string;
  n: string;
}

export function overviewView(store: Store): HTMLElement {
  const { model } = store.state;
  const root = el("div");

  root.appendChild(
    el(
      "div",
      { class: "page-head" },
      el("h1", { text: model.projectName }),
      el("p", {
        text: "Project readiness at a glance, and the items standing between this scope and an exportable package.",
      }),
    ),
  );

  if (model.requirements.length === 0) {
    root.appendChild(
      emptyState(
        "No requirements captured yet",
        "Add customer material on the intake screen and run extraction. You can also load the seeded Northwind Logistics scenario to see the full workflow with realistic data.",
        el(
          "div",
          { class: "page-head" },
          el(
            "div",
            { class: "actions" },
            button("Go to intake", {
              variant: "primary",
              onClick: () => {
                location.hash = "#/intake";
              },
            }),
            button("Load seeded scenario", {
              onClick: () => {
                store.loadSeed();
                location.hash = "#/intake";
              },
            }),
          ),
        ),
      ),
    );
    return root;
  }

  const coverage = store.coverage();
  const quality = store.quality();
  const estimate = store.estimateValue();
  const openQuestions = store.openQuestions();
  const blockingQuestions = openQuestions.filter((q) => q.blocking);
  const customerGrounded = model.requirements.filter(
    (r) => r.provenance === "customer-stated" && r.citationResolved,
  ).length;

  const steps: { label: string; done: boolean; note: string }[] = [
    {
      label: "Intake",
      done: model.sources.length > 0,
      note: `${model.sources.length} source(s)`,
    },
    {
      label: "Requirements",
      done: model.requirements.every(
        (r) => r.status !== "in-review" && r.status !== "draft",
      ),
      note: `${model.requirements.length} captured`,
    },
    {
      label: "Scope approved",
      done: model.approval.scopeApproved,
      note: model.approval.scopeApproved
        ? `at v${model.approval.approvedAtVersion}`
        : "not yet",
    },
    {
      label: "Architecture",
      done: store.state.artifacts.architecture !== null,
      note: model.configuration.cloud ?? "no cloud selected",
    },
    {
      label: "Estimate",
      done: estimate !== null,
      note: estimate
        ? `${estimate.timeline.weeksLow}\u2013${estimate.timeline.weeksHigh} weeks`
        : "not generated",
    },
    {
      label: "Quality gate",
      done: quality.status === "READY",
      note: GATE_LABEL[quality.status],
    },
  ];
  const currentIndex = steps.findIndex((s) => !s.done);

  const stepStrip = el("div", { class: "steps" });
  steps.forEach((step, index) => {
    stepStrip.appendChild(
      el(
        "div",
        {
          class:
            `step ${step.done ? "done" : index === currentIndex ? "current" : ""}`.trim(),
        },
        el("b", { text: step.label }),
        el("span", { text: step.note }),
      ),
    );
  });
  root.appendChild(stepStrip);

  const cells: Cell[] = [
    {
      k: "Requirements",
      v: String(model.requirements.length),
      n: `${customerGrounded} traceable to a resolved citation`,
    },
    {
      k: "Coverage",
      v: `${coverage.covered}/${coverage.inScopeTotal}`,
      n:
        coverage.uncovered > 0
          ? `${coverage.uncovered} uncovered`
          : "all in-scope requirements covered",
    },
    {
      k: "Open questions",
      v: String(openQuestions.length),
      n:
        blockingQuestions.length > 0
          ? `${blockingQuestions.length} blocking`
          : "none blocking",
    },
    {
      k: "Assumptions",
      v: String(model.assumptions.length),
      n: `${model.assumptions.filter((a) => a.status === "approved").length} approved`,
    },
    {
      k: "Effort",
      v: estimate
        ? `${Math.round(estimate.totals.lowHours)}\u2013${Math.round(estimate.totals.highHours)} h`
        : "Not yet available",
      n: estimate
        ? `confidence ${Math.round(estimate.confidence.score * 100)}% (${estimate.confidence.label})`
        : "generate the estimate to populate",
    },
    {
      k: "ROM",
      v: estimate
        ? `${formatCurrency(estimate.totals.romLow, estimate.totals.currency)}\u2013${formatCurrency(estimate.totals.romHigh, estimate.totals.currency)}`
        : "Not yet available",
      n: estimate
        ? `incl. ${Math.round(estimate.totals.contingency * 100)}% contingency`
        : "requires an approved scope",
    },
  ];
  const readiness = el("div", { class: "readiness" });
  for (const cell of cells) {
    readiness.appendChild(
      el(
        "div",
        { class: "cell" },
        el("div", { class: "k", text: cell.k }),
        el("div", { class: "v", text: cell.v }),
        el("div", { class: "n", text: cell.n }),
      ),
    );
  }
  root.appendChild(block("Readiness", readiness));

  const blockers = quality.checks.filter((c) => c.severity === "blocking");
  const warnings = quality.checks.filter((c) => c.severity === "warning");
  const issues = el("div");
  if (blockers.length === 0 && warnings.length === 0) {
    issues.appendChild(
      alert(
        "ok",
        "No outstanding validation issues",
        "Every check the quality gate runs currently passes.",
      ),
    );
  } else {
    for (const check of [...blockers, ...warnings].slice(0, 6)) {
      issues.appendChild(
        alert(
          check.severity === "blocking" ? "stop" : "warn",
          check.title,
          check.recommendedAction,
          button("Open", {
            small: true,
            onClick: () => {
              location.hash = check.route;
            },
          }),
        ),
      );
    }
    if (blockers.length + warnings.length > 6) {
      issues.appendChild(
        el("p", {
          class: "notice",
          text: `${blockers.length + warnings.length - 6} further item(s) on the quality gate screen.`,
        }),
      );
    }
  }
  root.appendChild(
    block(
      `Needs attention \u2014 ${blockers.length} blocking, ${warnings.length} warning`,
      issues,
    ),
  );

  if (blockingQuestions.length > 0) {
    const list = el(
      "div",
      { class: "panel" },
      el(
        "div",
        { class: "body" },
        ...blockingQuestions.slice(0, 5).map((q) =>
          el(
            "div",
            { style: "margin-bottom:12px" },
            el(
              "div",
              {
                style:
                  "display:flex;gap:8px;align-items:center;margin-bottom:3px",
              },
              idLink(q.id),
              chip("stop", "\u25B3", "Blocking"),
              chip("neutral", "\u25CF", q.category),
            ),
            el("div", {
              text: q.text,
              style: "font-size:13px;color:var(--ink-2)",
            }),
          ),
        ),
      ),
    );
    root.appendChild(block("Blocking clarification questions", list));
  }

  const history = model.history.slice(-6).reverse();
  if (history.length > 0) {
    const activity = el(
      "div",
      { class: "panel" },
      el(
        "div",
        { class: "body" },
        ...history.map((entry) =>
          el(
            "div",
            {
              style:
                "display:flex;gap:10px;align-items:baseline;margin-bottom:8px",
            },
            el("span", { class: "id", text: `v${entry.version}` }),
            el("span", { text: entry.summary, style: "font-size:13px;flex:1" }),
            el("span", {
              class: "count",
              text: `${entry.entries.length} change(s)`,
            }),
          ),
        ),
      ),
    );
    root.appendChild(block("Recent scope versions", activity));
  }

  const statusRow = el(
    "div",
    { class: "legend-row" },
    statusChip(model.approval.scopeApproved ? "approved" : "in-review"),
    chip(
      quality.status === "READY"
        ? "ok"
        : quality.status === "BLOCKED"
          ? "stop"
          : "warn",
      quality.status === "READY"
        ? "\u2713"
        : quality.status === "BLOCKED"
          ? "\u2715"
          : "\u25B3",
      `Quality gate: ${GATE_LABEL[quality.status]}`,
    ),
    chip("neutral", "\u25CF", `Scope model v${model.version}`),
  );
  root.appendChild(block("Status", statusRow));

  return root;
}
