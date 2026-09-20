import { el } from "../dom";
import { Store } from "../state";
import {
  alert,
  block,
  button,
  chip,
  emptyState,
  idLink,
  provenanceChip,
  statusChip,
} from "../components/primitives";
import { dataTable } from "../components/table";

export function scopeView(store: Store, rerender: () => void): HTMLElement {
  const { model, artifacts } = store.state;
  const root = el("div");
  const busy = store.state.busy?.key === "scope";

  root.appendChild(
    el(
      "div",
      { class: "page-head" },
      el("h1", { text: "Scope and PRD" }),
      el("p", {
        text: "The product requirements document and the functional scope are assembled from the scope model, so every section names the requirements it derives from.",
      }),
      el(
        "div",
        { class: "actions" },
        button(
          busy
            ? "Generating\u2026"
            : artifacts.prd
              ? "Regenerate from current scope"
              : "Generate scope and PRD",
          {
            variant: "primary",
            disabled: !model.approval.scopeApproved || busy,
            disabledReason: model.approval.scopeApproved
              ? "Generation is running."
              : "Approve the scope model on the requirements screen first.",
            onClick: () => {
              void store.generateScope().then(() => rerender());
            },
          },
        ),
        artifacts.prd?.meta.stale
          ? chip("warn", "\u25B3", "Stale relative to current scope version")
          : artifacts.prd
            ? chip(
                "ok",
                "\u2713",
                `Current at v${artifacts.prd.meta.scopeModelVersion}`,
              )
            : null,
      ),
    ),
  );

  if (store.state.lastError) {
    root.appendChild(
      alert("stop", store.state.lastError.title, store.state.lastError.detail),
    );
  }

  if (!model.approval.scopeApproved) {
    root.appendChild(
      alert(
        "warn",
        "Scope model is not approved",
        "The PRD and functional scope are generated only from an approved scope model, so that every downstream artifact pins a known version.",
      ),
    );
  }

  if (!artifacts.prd) {
    root.appendChild(
      emptyState(
        "No PRD generated yet",
        "Once the scope model is approved, the assistant groups requirements into capabilities and deliverable scope items, then assembles the PRD from them.",
        button("Go to requirements", {
          onClick: () => {
            location.hash = "#/requirements";
          },
        }),
      ),
    );
    return root;
  }

  if (artifacts.prd.meta.stale) {
    root.appendChild(
      alert(
        "warn",
        "This document is stale",
        artifacts.prd.meta.staleReason,
        button("Regenerate", {
          small: true,
          onClick: () => {
            void store.regenerate("prd").then(() => rerender());
          },
        }),
      ),
    );
  }

  // ---- document with outline ----
  const outline = el("nav", { class: "outline panel" });
  const outlineBody = el("div", { class: "body", style: "padding:6px 0" });
  const doc = el("article", { class: "doc" });

  doc.appendChild(
    el("h2", {
      style: "font-family:var(--serif);font-size:22px;margin:0 0 4px",
      text: artifacts.prd.title,
    }),
  );
  doc.appendChild(
    el("p", {
      class: "trace",
      text: `${artifacts.prd.meta.artifactId} \u00b7 scope model v${artifacts.prd.meta.scopeModelVersion} \u00b7 generated ${new Date(artifacts.prd.meta.generatedAt).toLocaleString()}`,
    }),
  );
  doc.appendChild(el("p", { text: artifacts.prd.executiveSummary }));

  for (const section of artifacts.prd.sections) {
    const anchor = `sec-${section.id}`;
    const link = el("a", { href: `#${anchor}`, text: section.heading });
    outlineBody.appendChild(link);

    doc.appendChild(
      el(
        "h3",
        { id: anchor },
        section.heading,
        el(
          "span",
          { style: "margin-left:8px" },
          provenanceChip(section.provenance),
        ),
      ),
    );
    for (const paragraph of section.body.split("\n\n")) {
      doc.appendChild(el("p", { text: paragraph.replace(/\*\*/g, "") }));
    }
    if (section.requirementIds.length > 0) {
      doc.appendChild(
        el("p", {
          class: "trace",
          text: `Derived from ${section.requirementIds.join(", ")}`,
        }),
      );
    }
  }
  outline.appendChild(outlineBody);
  root.appendChild(
    block(
      "Product requirements document",
      el("div", { class: "split" }, outline, doc),
    ),
  );

  // ---- functional scope ----
  if (artifacts.functionalScope) {
    const container = el("div");
    for (const pack of artifacts.functionalScope.packages) {
      const items = pack.scopeItemIds
        .map((id) => model.scopeItems.find((i) => i.id === id))
        .filter((i): i is NonNullable<typeof i> => i !== undefined);
      container.appendChild(
        el("h3", {
          style: "font-size:13px;margin:16px 0 8px",
          text: `${pack.name} \u2014 ${items.length} item(s)`,
        }),
      );
      container.appendChild(
        dataTable({
          columns: [
            {
              key: "id",
              header: "ID",
              width: "82px",
              render: (i) => idLink(i.id),
            },
            {
              key: "name",
              header: "Scope item",
              render: (i) => el("div", { class: "wrap", text: i.name }),
            },
            {
              key: "covers",
              header: "Covers",
              width: "200px",
              render: (i) =>
                el("span", { class: "id", text: i.requirementIds.join(", ") }),
            },
            {
              key: "origin",
              header: "Origin",
              width: "150px",
              render: (i) => provenanceChip(i.provenance),
            },
            {
              key: "status",
              header: "Status",
              width: "124px",
              render: (i) => statusChip(i.status),
            },
          ],
          rows: items,
          rowId: (i) => i.id,
        }),
      );
    }
    if (artifacts.functionalScope.exclusions.length > 0) {
      container.appendChild(
        el("h3", {
          style: "font-size:13px;margin:20px 0 8px",
          text: "Explicitly out of scope",
        }),
      );
      const list = el("ul", {
        style: "margin:0;padding-left:20px;font-size:13px;color:var(--ink-2)",
      });
      for (const exclusion of artifacts.functionalScope.exclusions) {
        list.appendChild(el("li", { text: exclusion }));
      }
      container.appendChild(list);
    }
    root.appendChild(block("Functional scope", container));
  }

  // ---- coverage ----
  const coverage = store.coverage();
  const coverageBody = el("div");
  coverageBody.appendChild(
    el(
      "div",
      { class: "legend-row" },
      chip("ok", "\u2713", `${coverage.covered} covered`),
      chip("warn", "\u25B3", `${coverage.weak} weakly covered`),
      chip("stop", "\u2715", `${coverage.uncovered} uncovered`),
    ),
  );
  coverageBody.appendChild(
    el("p", {
      class: "notice",
      text: "Coverage is computed from declared links between scope items and requirements. Nothing is inferred from wording similarity.",
    }),
  );
  coverageBody.appendChild(
    dataTable({
      columns: [
        {
          key: "req",
          header: "Requirement",
          width: "110px",
          render: (r) =>
            idLink(r.requirementId, () => {
              store.select("requirement", r.requirementId);
              location.hash = "#/requirements";
            }),
        },
        {
          key: "state",
          header: "Coverage",
          width: "150px",
          render: (r) =>
            r.state === "covered"
              ? chip("ok", "\u2713", "Covered")
              : r.state === "weakly-covered"
                ? chip("warn", "\u25B3", "Weak")
                : chip("stop", "\u2715", "Uncovered"),
        },
        {
          key: "by",
          header: "Covered by",
          width: "180px",
          render: (r) =>
            el("span", {
              class: "id",
              text: r.scopeItemIds.join(", ") || "\u2014",
            }),
        },
        {
          key: "why",
          header: "Reason",
          render: (r) => el("div", { class: "wrap", text: r.reason }),
        },
      ],
      rows: coverage.rows,
      rowId: (r) => r.requirementId,
    }),
  );
  if (coverage.unsupportedAdditions.length > 0) {
    coverageBody.appendChild(
      alert(
        "warn",
        `${coverage.unsupportedAdditions.length} scope item(s) cover no live requirement`,
        `These add delivery effort with no traceable customer justification: ${coverage.unsupportedAdditions.join(", ")}.`,
      ),
    );
  }
  root.appendChild(block("Requirement coverage", coverageBody));

  return root;
}
