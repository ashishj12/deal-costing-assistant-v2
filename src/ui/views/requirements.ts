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
  provenanceChip,
  select,
  statusChip,
} from "../components/primitives";
import { dataTable } from "../components/table";
import { drawer } from "../components/drawer";
import { toast } from "../components/toast";
import { Requirement } from "../../domain/entities";
import {
  PROVENANCE_DESCRIPTION,
  PROVENANCE_VALUES,
} from "../../domain/provenance";

interface Filters {
  type: string;
  priority: string;
  provenance: string;
  status: string;
  query: string;
}
const filters: Filters = {
  type: "all",
  priority: "all",
  provenance: "all",
  status: "all",
  query: "",
};

/**
 * The review surface. Its job is to make provenance impossible to overlook
 * and to make confirming an AI-derived requirement a deliberate act.
 */
export function requirementsView(
  store: Store,
  rerender: () => void,
): HTMLElement {
  const { model } = store.state;
  const root = el("div");

  root.appendChild(
    el(
      "div",
      { class: "page-head" },
      el("h1", { text: "Requirements" }),
      el("p", {
        text: "Every row states where it came from. A requirement is only shown as customer-stated when its quotation resolved against the original source text.",
      }),
    ),
  );

  if (model.requirements.length === 0) {
    root.appendChild(
      emptyState(
        "No requirements yet",
        "Run extraction on the intake screen, or add a requirement manually.",
        el(
          "div",
          { style: "display:flex;gap:8px" },
          button("Go to intake", {
            variant: "primary",
            onClick: () => {
              location.hash = "#/intake";
            },
          }),
          button("Add manually", {
            onClick: () => {
              store.addRequirement();
              rerender();
            },
          }),
        ),
      ),
    );
    return root;
  }

  const legend = el(
    "div",
    { class: "legend-row" },
    ...PROVENANCE_VALUES.map((p) => provenanceChip(p)),
  );
  root.appendChild(legend);

  // ---- filters ----
  const filterRow = el("div", { class: "filters" });
  const search = el("input", {
    type: "text",
    placeholder: "Search descriptions",
    value: filters.query,
  });
  search.addEventListener("input", () => {
    filters.query = search.value;
    rerender();
  });
  filterRow.appendChild(search);
  filterRow.appendChild(
    select(
      [
        { value: "all", label: "All types" },
        ...[
          "functional",
          "non-functional",
          "integration",
          "data",
          "security",
          "compliance",
          "operational",
        ].map((t) => ({ value: t, label: t })),
      ],
      filters.type,
      (v) => {
        filters.type = v;
        rerender();
      },
    ),
  );
  filterRow.appendChild(
    select(
      [
        { value: "all", label: "All priorities" },
        ...["must", "should", "could", "wont"].map((p) => ({
          value: p,
          label: p,
        })),
      ],
      filters.priority,
      (v) => {
        filters.priority = v;
        rerender();
      },
    ),
  );
  filterRow.appendChild(
    select(
      [
        { value: "all", label: "All origins" },
        ...PROVENANCE_VALUES.map((p) => ({ value: p, label: p })),
      ],
      filters.provenance,
      (v) => {
        filters.provenance = v;
        rerender();
      },
    ),
  );
  filterRow.appendChild(
    select(
      [
        { value: "all", label: "All statuses" },
        ...["draft", "in-review", "approved", "needs-changes", "rejected"].map(
          (s) => ({ value: s, label: s }),
        ),
      ],
      filters.status,
      (v) => {
        filters.status = v;
        rerender();
      },
    ),
  );
  filterRow.appendChild(el("span", { class: "spacer" }));
  filterRow.appendChild(
    button("Add requirement", {
      small: true,
      onClick: () => {
        store.addRequirement();
        rerender();
      },
    }),
  );

  const rows = model.requirements.filter(
    (r) =>
      (filters.type === "all" || r.type === filters.type) &&
      (filters.priority === "all" || r.priority === filters.priority) &&
      (filters.provenance === "all" || r.provenance === filters.provenance) &&
      (filters.status === "all" || r.status === filters.status) &&
      (filters.query === "" ||
        r.description.toLowerCase().includes(filters.query.toLowerCase()) ||
        r.id.toLowerCase().includes(filters.query.toLowerCase())),
  );

  filterRow.appendChild(
    el("span", {
      class: "count",
      text: `${rows.length} of ${model.requirements.length}`,
    }),
  );
  root.appendChild(filterRow);

  const selectedId = store.state.selection["requirement"] ?? null;
  const table = dataTable<Requirement>({
    columns: [
      {
        key: "id",
        header: "ID",
        width: "82px",
        render: (r) => idLink(r.id),
        sortValue: (r) => r.id,
      },
      {
        key: "description",
        header: "Requirement",
        render: (r) =>
          el("div", {
            class: "wrap",
            text:
              r.description.length > 180
                ? `${r.description.slice(0, 177)}\u2026`
                : r.description,
          }),
        sortValue: (r) => r.description,
      },
      {
        key: "type",
        header: "Type",
        width: "120px",
        render: (r) => r.type,
        sortValue: (r) => r.type,
      },
      {
        key: "priority",
        header: "Priority",
        width: "88px",
        render: (r) => r.priority,
        sortValue: (r) =>
          ["must", "should", "could", "wont"].indexOf(r.priority),
      },
      {
        key: "provenance",
        header: "Origin",
        width: "150px",
        render: (r) => provenanceChip(r.provenance, r.citationResolved),
        sortValue: (r) => r.provenance,
      },
      {
        key: "status",
        header: "Status",
        width: "124px",
        render: (r) => statusChip(r.status),
        sortValue: (r) => r.status,
      },
    ],
    rows,
    rowId: (r) => r.id,
    selectedId,
    onSelect: (r) => {
      store.select("requirement", r.id);
      rerender();
    },
    emptyMessage: "No requirement matches these filters.",
  });
  root.appendChild(table);

  // ---- bulk approval and the approval gate ----
  const unreviewed = model.requirements.filter(
    (r) => r.status === "draft" || r.status === "in-review",
  );
  const blocking = model.questions.filter((q) => q.blocking && !q.resolved);
  const gateBody = el("div");

  if (model.approval.scopeApproved) {
    gateBody.appendChild(
      alert(
        "ok",
        `Scope approved at version ${model.approval.approvedAtVersion}`,
        "Downstream artifacts pin this version. Changing an approved requirement will flag the scope as drifted until it is re-approved.",
      ),
    );
  } else {
    if (blocking.length > 0) {
      gateBody.appendChild(
        alert(
          "stop",
          `${blocking.length} blocking question(s) unresolved`,
          "Approval is unavailable until each blocking question is answered or converted into an owned assumption.",
        ),
      );
    }
    if (unreviewed.length > 0) {
      gateBody.appendChild(
        alert(
          "warn",
          `${unreviewed.length} requirement(s) awaiting review`,
          "Approve, reject or request changes on each one. Bulk approval is available below but records the same review decision on every selected row.",
        ),
      );
      gateBody.appendChild(
        el(
          "div",
          { style: "display:flex;gap:8px;margin-bottom:12px" },
          button(`Approve all ${unreviewed.length} unreviewed`, {
            onClick: () => {
              if (
                confirm(
                  `Approve ${unreviewed.length} requirement(s)? This records a review decision on each and creates a new scope version.`,
                )
              ) {
                store.bulkSetStatus(
                  unreviewed.map((r) => r.id),
                  "approved",
                );
                rerender();
              }
            },
          }),
        ),
      );
    }
    gateBody.appendChild(
      button("Approve scope model", {
        variant: "primary",
        disabled: blocking.length > 0 || unreviewed.length > 0,
        disabledReason:
          blocking.length > 0
            ? `${blocking.length} blocking question(s) must be resolved first.`
            : `${unreviewed.length} requirement(s) are still awaiting review.`,
        onClick: () => {
          const result = store.approveScope();
          if (!result.ok) toast("stop", "Approval blocked", result.reason);
          else
            toast(
              "ok",
              "Scope approved",
              "Downstream generation is now available.",
            );
          rerender();
        },
      }),
    );
  }
  root.appendChild(block("Scope approval", gateBody));

  // ---- questions ----
  const openQuestions = model.questions.filter((q) => !q.resolved);
  if (model.questions.length > 0) {
    const list = el(
      "div",
      { class: "panel" },
      el(
        "div",
        { class: "body" },
        ...model.questions.map((q) => {
          const answer = el("input", {
            type: "text",
            value: q.answer,
            placeholder: "Record the answer",
          });
          const row = el(
            "div",
            {
              style:
                "padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid var(--rule-soft)",
            },
            el(
              "div",
              {
                style:
                  "display:flex;gap:8px;align-items:center;margin-bottom:4px;flex-wrap:wrap",
              },
              idLink(q.id),
              q.blocking
                ? chip("stop", "\u25B3", "Blocking")
                : chip("neutral", "\u25CB", q.severity),
              chip("neutral", "\u25CF", q.category),
              q.resolved ? chip("ok", "\u2713", "Resolved") : null,
            ),
            el("div", {
              text: q.text,
              style: "font-size:13px;margin-bottom:6px",
            }),
          );
          if (!q.resolved) {
            row.appendChild(
              el(
                "div",
                { style: "display:flex;gap:8px;align-items:flex-start" },
                answer,
                button("Resolve", {
                  small: true,
                  onClick: () => {
                    if (answer.value.trim().length === 0) {
                      toast(
                        "warn",
                        "An answer is required",
                        "Resolving a question without recording the answer loses the reason it was closed.",
                      );
                      return;
                    }
                    store.resolveQuestion(q.id, answer.value.trim());
                    rerender();
                  },
                }),
              ),
            );
          } else {
            row.appendChild(
              el("div", { class: "notice", text: `Answer: ${q.answer}` }),
            );
          }
          return row;
        }),
      ),
    );
    root.appendChild(
      block(
        `Clarification questions \u2014 ${openQuestions.length} open`,
        list,
      ),
    );
  }

  // ---- assumptions ----
  if (model.assumptions.length > 0) {
    const table2 = dataTable({
      columns: [
        { key: "id", header: "ID", width: "82px", render: (a) => idLink(a.id) },
        {
          key: "text",
          header: "Assumption",
          render: (a) => el("div", { class: "wrap", text: a.text }),
        },
        {
          key: "owner",
          header: "Owner",
          width: "140px",
          render: (a) => a.owner,
        },
        {
          key: "status",
          header: "Status",
          width: "124px",
          render: (a) => statusChip(a.status),
        },
        {
          key: "act",
          header: "",
          width: "96px",
          sortable: false,
          render: (a) =>
            a.status === "approved"
              ? el("span", { class: "count", text: "\u2014" })
              : button("Approve", {
                  small: true,
                  onClick: () => {
                    store.updateAssumption(a.id, {
                      status: "approved",
                      owner: "reviewer",
                    });
                    rerender();
                  },
                }),
        },
      ],
      rows: model.assumptions,
      rowId: (a) => a.id,
    });
    root.appendChild(
      block(`Assumptions (${model.assumptions.length})`, table2),
    );
  }

  // ---- detail drawer ----
  if (selectedId) {
    const requirement = store.requirement(selectedId);
    if (requirement)
      root.appendChild(requirementDrawer(store, requirement, rerender));
  }

  return root;
}

function requirementDrawer(
  store: Store,
  requirement: Requirement,
  rerender: () => void,
): HTMLElement {
  const body = el("div");

  body.appendChild(
    el(
      "div",
      { class: "legend-row" },
      provenanceChip(requirement.provenance, requirement.citationResolved),
      statusChip(requirement.status),
      chip(
        "neutral",
        "\u25CF",
        `confidence ${Math.round(requirement.confidence * 100)}%`,
      ),
    ),
  );
  body.appendChild(
    el("p", {
      class: "notice",
      text: PROVENANCE_DESCRIPTION[requirement.provenance],
    }),
  );

  const description = el("textarea", {
    style: "min-height:110px;font-family:var(--sans);font-size:13px",
  });
  description.value = requirement.description;
  body.appendChild(field("Description", description));

  const typeSelect = select(
    [
      "functional",
      "non-functional",
      "integration",
      "data",
      "security",
      "compliance",
      "operational",
    ].map((t) => ({ value: t, label: t })),
    requirement.type,
    () => undefined,
  );
  const prioritySelect = select(
    ["must", "should", "could", "wont"].map((p) => ({ value: p, label: p })),
    requirement.priority,
    () => undefined,
  );
  const statusSelect = select(
    ["draft", "in-review", "approved", "needs-changes", "rejected"].map(
      (s) => ({ value: s, label: s }),
    ),
    requirement.status,
    () => undefined,
  );
  body.appendChild(field("Type", typeSelect));
  body.appendChild(field("Priority", prioritySelect));
  body.appendChild(field("Review status", statusSelect));

  if (requirement.rationale) {
    body.appendChild(
      el("p", {
        class: "notice",
        text: `Classification rationale: ${requirement.rationale}`,
      }),
    );
  }

  // Source evidence, with the cited span highlighted in the real text.
  if (requirement.sourceSpan) {
    const source = store.source(requirement.sourceSpan.sourceId);
    if (source) {
      const { start, end } = requirement.sourceSpan;
      const before = source.content.slice(Math.max(0, start - 260), start);
      const quoted = source.content.slice(start, end);
      const after = source.content.slice(end, end + 260);
      body.appendChild(
        el("h4", {
          style: "font-size:12px;margin:20px 0 6px",
          text: `Source evidence \u2014 ${source.name}`,
        }),
      );
      body.appendChild(
        el(
          "div",
          { class: "source-quote" },
          el("span", { text: `\u2026${before}` }),
          el("mark", { text: quoted }),
          el("span", { text: `${after}\u2026` }),
        ),
      );
      body.appendChild(
        el("p", {
          class: "notice",
          text: `Characters ${start}\u2013${end} of ${source.id}. ${requirement.citationResolved ? "Resolved against the original text." : "This citation did not resolve."}`,
        }),
      );
    } else {
      body.appendChild(
        alert(
          "stop",
          "Cited source is missing",
          `${requirement.sourceSpan.sourceId} is no longer in the scope model, so this citation cannot be verified.`,
        ),
      );
    }
  } else {
    body.appendChild(
      alert(
        "info",
        "No source evidence",
        "This requirement was not traced to customer material. It carries into the package as an assistant-derived item.",
      ),
    );
  }

  const covering = store.state.model.scopeItems.filter((i) =>
    i.requirementIds.includes(requirement.id),
  );
  body.appendChild(
    el("h4", { style: "font-size:12px;margin:20px 0 6px", text: "Coverage" }),
  );
  body.appendChild(
    el("p", {
      class: "notice",
      text:
        covering.length > 0
          ? `Covered by ${covering.map((i) => i.id).join(", ")}.`
          : "No scope item covers this requirement yet.",
    }),
  );

  const save = button("Save changes", {
    variant: "primary",
    onClick: () => {
      store.updateRequirement(
        requirement.id,
        {
          description: description.value.trim(),
          type: typeSelect.value as Requirement["type"],
          priority: prioritySelect.value as Requirement["priority"],
          status: statusSelect.value as Requirement["status"],
        },
        `Edited ${requirement.id}`,
      );
      toast(
        "ok",
        "Requirement updated",
        "A new scope version was created. Affected artifacts are flagged on the changes screen.",
      );
      store.select("requirement", null);
      rerender();
    },
  });

  return drawer({
    title: requirement.id,
    body,
    footer: [
      save,
      button("Reject", {
        onClick: () => {
          store.updateRequirement(
            requirement.id,
            { status: "rejected" },
            `Rejected ${requirement.id}`,
          );
          store.select("requirement", null);
          rerender();
        },
      }),
      button("Delete", {
        variant: "danger",
        onClick: () => {
          if (
            confirm(
              `Delete ${requirement.id}? Its identifier is retired and never reused, so any artifact still referencing it will be flagged rather than silently repointed.`,
            )
          ) {
            store.deleteRequirement(requirement.id);
            rerender();
          }
        },
      }),
    ],
    onClose: () => {
      store.select("requirement", null);
      rerender();
    },
  });
}
