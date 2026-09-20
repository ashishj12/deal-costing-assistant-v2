import { el } from "../dom";
import { Store } from "../state";
import {
  alert,
  block,
  button,
  chip,
  emptyState,
  field,
  idLink,
  kv,
  panel,
  select,
} from "../components/primitives";
import { dataTable } from "../components/table";
import { formatCurrency } from "../../engines/estimation";
import {
  CONFIDENCE_WEIGHTS,
  DEFAULT_RATES,
  RATE_CARD_VERSION,
  ROLES,
  ROLE_LABEL,
  Role,
} from "../../engines/rates";

/**
 * Every number here is traceable to the inputs that produced it. The
 * calculation panel is not a nicety: a ROM a reviewer cannot audit is a ROM
 * they cannot defend in front of a customer.
 */
export function estimationView(
  store: Store,
  rerender: () => void,
): HTMLElement {
  const { model, artifacts } = store.state;
  const root = el("div");
  const busy = store.state.busy?.key === "estimate";

  root.appendChild(
    el(
      "div",
      { class: "page-head" },
      el("h1", { text: "Effort, timeline and ROM" }),
      el("p", {
        text: `Effort is computed deterministically from complexity bands and documented factors. The assistant proposes a band and a rationale; it never returns hours, rates or money. Rate card ${RATE_CARD_VERSION}.`,
      }),
      el(
        "div",
        { class: "actions" },
        button(
          busy
            ? "Building\u2026"
            : artifacts.workstreams
              ? "Rebuild workstreams"
              : "Build workstreams",
          {
            variant: "primary",
            disabled: model.scopeItems.length === 0 || busy,
            disabledReason: "Generate the functional scope first.",
            onClick: () => {
              void store.generateWorkstreams().then(() => rerender());
            },
          },
        ),
      ),
    ),
  );

  if (
    artifacts.workstreams &&
    store.state.workstreamsGeneratedAtVersion !== null &&
    store.state.workstreamsGeneratedAtVersion !== model.version
  ) {
    root.appendChild(
      alert(
        "warn",
        "This estimate is stale",
        "The scope model changed since the workstreams were generated.",
        button("Rebuild workstreams", {
          small: true,
          onClick: () => {
            void store.generateWorkstreams().then(() => rerender());
          },
        }),
      ),
    );
  }

  root.appendChild(
    block("Estimation inputs", configurationPanel(store, rerender)),
  );

  const result = store.estimate();
  if (!result) {
    root.appendChild(
      emptyState(
        "No estimate yet",
        "Build the workstreams to produce an effort range, a timeline and a ROM. Everything downstream of the band assignment is deterministic and repeatable.",
      ),
    );
    return root;
  }
  if (!result.ok) {
    root.appendChild(
      alert(
        "stop",
        "The estimate could not be computed",
        `${result.error.message} (field: ${result.error.field}). Correct the input above and the estimate will recompute.`,
      ),
    );
    return root;
  }

  const estimate = result.value;
  const currency = estimate.totals.currency;

  // ---- headline ----
  const headline = el("div", { class: "readiness" });
  const cells: [string, string, string][] = [
    [
      "Effort",
      `${Math.round(estimate.totals.lowHours)}\u2013${Math.round(estimate.totals.highHours)} h`,
      `midpoint ${Math.round(estimate.totals.midHours)} h`,
    ],
    [
      "Timeline",
      `${estimate.timeline.weeksLow}\u2013${estimate.timeline.weeksHigh} wk`,
      `critical path: ${estimate.timeline.criticalPathIds.join(" \u2192 ") || "n/a"}`,
    ],
    [
      "Cost before contingency",
      `${formatCurrency(estimate.totals.costLow, currency)}\u2013${formatCurrency(estimate.totals.costHigh, currency)}`,
      `rate card ${estimate.totals.rateCardVersion}`,
    ],
    [
      "ROM",
      `${formatCurrency(estimate.totals.romLow, currency)}\u2013${formatCurrency(estimate.totals.romHigh, currency)}`,
      `incl. ${Math.round(estimate.totals.contingency * 100)}% contingency`,
    ],
    [
      "Confidence",
      `${Math.round(estimate.confidence.score * 100)}%`,
      estimate.confidence.label,
    ],
  ];
  for (const [k, v, n] of cells) {
    headline.appendChild(
      el(
        "div",
        { class: "cell" },
        el("div", { class: "k", text: k }),
        el("div", { class: "v", text: v }),
        el("div", { class: "n", text: n }),
      ),
    );
  }
  root.appendChild(block("Headline", headline));

  if (estimate.timeline.deadlineConflict) {
    root.appendChild(
      alert(
        "stop",
        "The timeline does not fit the target deadline",
        `The upper estimate is ${estimate.timeline.weeksHigh} weeks against a target of ${model.configuration.targetDeadlineWeeks} weeks. Adding people does not compress the critical path (${estimate.timeline.criticalPathIds.join(" \u2192 ")}); scope or sequence has to change.`,
      ),
    );
  }

  // ---- workstreams ----
  const selectedId = store.state.selection["workstream"] ?? null;
  root.appendChild(
    block(
      "Workstreams",
      dataTable({
        columns: [
          {
            key: "id",
            header: "ID",
            width: "80px",
            render: (w) =>
              idLink(w.workstreamId, () => {
                store.select("workstream", w.workstreamId);
                rerender();
              }),
          },
          {
            key: "name",
            header: "Workstream",
            render: (w) => el("div", { class: "wrap", text: w.name }),
          },
          {
            key: "band",
            header: "Band",
            width: "70px",
            render: (w) => chip("neutral", "\u25CF", w.band),
            sortValue: (w) => ["S", "M", "L", "XL"].indexOf(w.band),
          },
          {
            key: "base",
            header: "Base h",
            numeric: true,
            width: "80px",
            render: (w) => String(w.baseHours),
            sortValue: (w) => w.baseHours,
          },
          {
            key: "adj",
            header: "Adjusted h",
            numeric: true,
            width: "100px",
            render: (w) => String(w.adjustedHours),
            sortValue: (w) => w.adjustedHours,
          },
          {
            key: "range",
            header: "Range h",
            numeric: true,
            width: "130px",
            render: (w) => `${w.lowHours}\u2013${w.highHours}`,
            sortValue: (w) => w.lowHours,
          },
          {
            key: "cost",
            header: `Cost (${currency})`,
            numeric: true,
            width: "120px",
            render: (w) => formatCurrency(w.cost, currency),
            sortValue: (w) => w.cost,
          },
        ],
        rows: estimate.workstreams,
        rowId: (w) => w.workstreamId,
        selectedId,
        onSelect: (w) => {
          store.select("workstream", w.workstreamId);
          rerender();
        },
      }),
    ),
  );

  const selected = estimate.workstreams.find(
    (w) => w.workstreamId === selectedId,
  );
  if (selected) {
    const drill = el("div");
    drill.appendChild(
      kv([
        ["Band", `${selected.band} \u2014 base ${selected.baseHours} hours`],
        ["Why this band", selected.bandRationale],
        ["Drivers", selected.drivers.join(" \u00b7 ") || "None recorded"],
        ["Requirements", selected.requirementIds.join(", ") || "None linked"],
        ["Dependencies", selected.dependencies.join(", ") || "None"],
      ]),
    );
    const steps = el("div", { class: "mono-block", style: "margin-top:12px" });
    let running = selected.baseHours;
    const lines = [
      `base (${selected.band})                = ${selected.baseHours.toFixed(1)} h`,
    ];
    for (const factor of selected.factors) {
      if (factor.label === "Productivity") {
        running = running / factor.value;
        lines.push(
          `\u00f7 productivity  \u00d7${factor.value.toFixed(2)}     = ${running.toFixed(1)} h   ${factor.explanation}`,
        );
      } else {
        running = running * factor.value;
        lines.push(
          `\u00d7 ${factor.label.padEnd(15)} \u00d7${factor.value.toFixed(2)}     = ${running.toFixed(1)} h   ${factor.explanation}`,
        );
      }
    }
    lines.push(
      `uncertainty band      = ${selected.lowHours} \u2013 ${selected.highHours} h`,
    );
    lines.push("");
    for (const [role, hours] of Object.entries(selected.roleHours)) {
      const rate = estimate.rates[role] ?? 0;
      lines.push(
        `${(ROLE_LABEL[role as Role] ?? role).padEnd(20)} ${String(hours).padStart(7)} h \u00d7 ${String(rate).padStart(6)} = ${formatCurrency(hours * rate, currency)}`,
      );
    }
    lines.push(
      `${"total".padEnd(20)} ${String(selected.adjustedHours).padStart(7)} h            = ${formatCurrency(selected.cost, currency)}`,
    );
    steps.textContent = lines.join("\n");
    drill.appendChild(steps);
    root.appendChild(
      block(
        `${selected.workstreamId} \u2014 how this number was produced`,
        panel(selected.name, drill),
      ),
    );
  }

  // ---- rates ----
  const rateBody = el("div");
  rateBody.appendChild(
    el("p", {
      class: "notice",
      text: "Rates are editable. Overrides apply immediately and are recorded in the exported package alongside the rate card version.",
    }),
  );
  const rateGrid = el("div", { class: "grid-2" });
  const half = Math.ceil(ROLES.length / 2);
  for (const group of [ROLES.slice(0, half), ROLES.slice(half)]) {
    const column = el("div");
    for (const role of group) {
      const base = DEFAULT_RATES[currency][role];
      const input = el("input", {
        type: "number",
        min: "0",
        step: "1",
        value: String(estimate.rates[role] ?? base),
      });
      input.addEventListener("change", () => {
        const parsed = Number(input.value);
        if (!Number.isFinite(parsed) || parsed < 0) {
          input.classList.add("invalid");
          return;
        }
        input.classList.remove("invalid");
        store.setRateOverride(role, parsed === base ? null : parsed);
        rerender();
      });
      column.appendChild(
        field(
          `${ROLE_LABEL[role]} (${currency}/h)`,
          input,
          store.state.rateOverrides[role] !== undefined
            ? `Overridden from the default of ${base}.`
            : `Rate card default: ${base}.`,
        ),
      );
    }
    rateGrid.appendChild(column);
  }
  rateBody.appendChild(rateGrid);
  root.appendChild(block("Rate basis", rateBody));

  // ---- confidence ----
  const confidence = el("div");
  confidence.appendChild(
    el("p", {
      class: "notice",
      text: "Confidence is computed from four measurable inputs, not asserted. Each is shown with the weight applied to it.",
    }),
  );
  confidence.appendChild(
    dataTable({
      columns: [
        { key: "input", header: "Input", render: (r) => r.label },
        {
          key: "value",
          header: "Value",
          numeric: true,
          width: "90px",
          render: (r) => `${Math.round(r.value * 100)}%`,
        },
        {
          key: "weight",
          header: "Weight",
          numeric: true,
          width: "90px",
          render: (r) => `${Math.round(r.weight * 100)}%`,
        },
        {
          key: "contrib",
          header: "Contribution",
          numeric: true,
          width: "120px",
          render: (r) => `${Math.round(r.value * r.weight * 100)}%`,
        },
        {
          key: "why",
          header: "How to improve it",
          render: (r) => el("div", { class: "wrap", text: r.how }),
        },
      ],
      rows: [
        {
          label: "Requirement grounding",
          value: estimate.confidence.grounding,
          weight: CONFIDENCE_WEIGHTS.grounding,
          how: "Resolve citations, or reclassify unverifiable items as inferred.",
        },
        {
          label: "Blocking question resolution",
          value: estimate.confidence.questionResolution,
          weight: CONFIDENCE_WEIGHTS.questionResolution,
          how: "Answer the blocking clarification questions.",
        },
        {
          label: "Assumption validation",
          value: estimate.confidence.assumptionValidation,
          weight: CONFIDENCE_WEIGHTS.assumptionValidation,
          how: "Assign owners and approve the outstanding assumptions.",
        },
        {
          label: "Mandatory coverage",
          value: estimate.confidence.coverage,
          weight: CONFIDENCE_WEIGHTS.coverage,
          how: "Ensure every must and should requirement is covered by an approved scope item.",
        },
      ],
      rowId: (r) => r.label,
    }),
  );
  root.appendChild(
    block(
      `Confidence \u2014 ${Math.round(estimate.confidence.score * 100)}% (${estimate.confidence.label})`,
      confidence,
    ),
  );

  const exclusions = el("ul", {
    style: "margin:0;padding-left:20px;font-size:13px",
  });
  for (const exclusion of estimate.exclusions)
    exclusions.appendChild(el("li", { text: exclusion }));
  root.appendChild(block("Excluded from this estimate", exclusions));

  return root;
}

function configurationPanel(store: Store, rerender: () => void): HTMLElement {
  const config = store.state.model.configuration;
  const body = el("div", { class: "grid-2" });

  const left = el("div");
  const users = el("input", {
    type: "number",
    min: "0",
    step: "100",
    value: String(config.expectedUsers),
  });
  users.addEventListener("change", () => {
    const parsed = Number(users.value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      users.classList.add("invalid");
      return;
    }
    users.classList.remove("invalid");
    store.stageConfiguration(
      { expectedUsers: parsed },
      `Changed expected users to ${parsed.toLocaleString("en-US")}`,
    );
    location.hash = "#/changes";
  });
  left.appendChild(
    field(
      "Expected users",
      users,
      `Currently the ${config.concurrencyTier} tier. Changing this stages a change for impact review rather than applying silently.`,
    ),
  );

  left.appendChild(
    field(
      "External systems",
      numberInput(
        String(config.externalSystemCount),
        (value) => {
          store.stageConfiguration(
            { externalSystemCount: value },
            `Changed external system count to ${value}`,
          );
          location.hash = "#/changes";
        },
        true,
      ),
      "Drives the integration factor: 8% per system, capped at 2.0x.",
    ),
  );

  left.appendChild(
    field(
      "Compliance tier",
      select(
        [
          { value: "standard", label: "Standard (1.00x)" },
          { value: "regulated", label: "Regulated (1.15x)" },
          { value: "critical", label: "Critical (1.35x)" },
        ],
        config.complianceTier,
        (value) => {
          store.stageConfiguration(
            { complianceTier: value as never },
            `Changed compliance tier to ${value}`,
          );
          location.hash = "#/changes";
        },
      ),
      "Applies a security multiplier to every workstream.",
    ),
  );

  const right = el("div");
  right.appendChild(
    field(
      "Data complexity",
      select(
        [
          { value: "low", label: "Low (1.00x)" },
          { value: "medium", label: "Medium (1.20x)" },
          { value: "high", label: "High (1.45x)" },
        ],
        config.dataComplexity,
        (value) => {
          store.stageConfiguration(
            { dataComplexity: value as never },
            `Changed data complexity to ${value}`,
          );
          location.hash = "#/changes";
        },
      ),
    ),
  );

  right.appendChild(
    field(
      "Productivity factor",
      numberInput(
        String(config.productivityFactor),
        (value) => {
          store.stageConfiguration(
            { productivityFactor: value },
            `Changed productivity factor to ${value}`,
          );
          location.hash = "#/changes";
        },
        false,
        0.5,
        1.5,
        0.05,
      ),
      "Divisor. Above 1.0 means a team delivering faster than the baseline.",
    ),
  );

  right.appendChild(
    field(
      "Contingency",
      numberInput(
        String(config.contingency),
        (value) => {
          store.stageConfiguration(
            { contingency: value },
            `Changed contingency to ${Math.round(value * 100)}%`,
          );
          location.hash = "#/changes";
        },
        false,
        0,
        1,
        0.05,
      ),
      "Applied to cost after the effort range, so it moves the ROM only.",
    ),
  );

  right.appendChild(
    field(
      "Team capacity (people)",
      numberInput(
        String(config.teamCapacity),
        (value) => {
          store.stageConfiguration(
            { teamCapacity: value },
            `Changed team capacity to ${value}`,
          );
          location.hash = "#/changes";
        },
        true,
        1,
        200,
      ),
      "Affects the timeline only. It cannot compress the critical path.",
    ),
  );

  right.appendChild(
    field(
      "Currency",
      select(
        ["USD", "EUR", "GBP", "INR", "AUD"].map((c) => ({
          value: c,
          label: c,
        })),
        config.currency,
        (value) => {
          store.stageConfiguration(
            { currency: value as never },
            `Changed currency to ${value}`,
          );
          location.hash = "#/changes";
        },
      ),
      "Switches the rate card. Effort is unchanged; cost is not comparable across currencies.",
    ),
  );

  body.appendChild(left);
  body.appendChild(right);

  const wrapper = el("div");
  wrapper.appendChild(body);
  if (store.state.pendingChange) {
    wrapper.appendChild(
      alert(
        "warn",
        "A change is staged for review",
        `"${store.state.pendingChange.summary}" has not been applied yet.`,
        button("Review impact", {
          small: true,
          onClick: () => {
            location.hash = "#/changes";
            rerender();
          },
        }),
      ),
    );
  }
  return wrapper;
}

function numberInput(
  value: string,
  onCommit: (value: number) => void,
  integer = false,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
  step = 1,
): HTMLInputElement {
  const input = el("input", {
    type: "number",
    value,
    min: String(min),
    max: String(max),
    step: String(step),
  });
  input.addEventListener("change", () => {
    const parsed = Number(input.value);
    if (
      !Number.isFinite(parsed) ||
      parsed < min ||
      parsed > max ||
      (integer && !Number.isInteger(parsed))
    ) {
      input.classList.add("invalid");
      return;
    }
    input.classList.remove("invalid");
    onCommit(parsed);
  });
  return input;
}
