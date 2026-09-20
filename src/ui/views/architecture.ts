import { el } from "../dom";
import { Store } from "../state";
import {
  alert,
  block,
  button,
  chip,
  emptyState,
  idLink,
  kv,
  panel,
  provenanceChip,
} from "../components/primitives";
import { architectureDiagram } from "../components/diagram";
import { dataTable } from "../components/table";
import { CLOUD_LABEL } from "../../engines/cloud-catalog";
import { Cloud } from "../../domain/entities";

export function architectureView(
  store: Store,
  rerender: () => void,
): HTMLElement {
  const { model, artifacts } = store.state;
  const root = el("div");
  const busy = store.state.busy?.key === "architecture";

  root.appendChild(
    el(
      "div",
      { class: "page-head" },
      el("h1", { text: "Solution architecture" }),
      el("p", {
        text: "Components are selected from a curated, provider-specific catalogue. Every component carries its purpose, its rationale, its trade-offs and the requirements that justify it.",
      }),
    ),
  );

  const selector = el("div", { class: "actions" });
  const clouds: (Cloud | "recommend")[] = ["aws", "azure", "gcp", "recommend"];
  for (const cloud of clouds) {
    const isCurrent =
      cloud !== "recommend" && model.configuration.cloud === cloud;
    selector.appendChild(
      button(cloud === "recommend" ? "Recommend for me" : CLOUD_LABEL[cloud], {
        variant: isCurrent ? "primary" : "default",
        disabled: busy || !model.approval.scopeApproved,
        disabledReason: model.approval.scopeApproved
          ? "Generation is running."
          : "Approve the scope model first.",
        onClick: () => {
          void store.generateArchitecture(cloud).then(() => rerender());
        },
      }),
    );
  }
  if (
    model.configuration.cloudSelectionMode === "recommended" &&
    model.configuration.cloud
  ) {
    selector.appendChild(
      chip(
        "neutral",
        "\u25CF",
        `${CLOUD_LABEL[model.configuration.cloud]} selected by recommendation`,
      ),
    );
  }
  root.appendChild(selector);

  if (store.state.lastError) {
    root.appendChild(
      el(
        "div",
        { style: "margin-top:16px" },
        alert(
          "stop",
          store.state.lastError.title,
          store.state.lastError.detail,
        ),
      ),
    );
  }

  if (!artifacts.architecture) {
    root.appendChild(
      el(
        "div",
        { style: "margin-top:16px" },
        emptyState(
          "No architecture generated yet",
          model.approval.scopeApproved
            ? "Choose a cloud provider, or ask for a recommendation. The recommendation follows a documented rule and shows its reasoning rather than picking silently."
            : "Approve the scope model on the requirements screen, then choose a cloud provider.",
        ),
      ),
    );
    return root;
  }

  const architecture = artifacts.architecture;
  if (architecture.meta.stale) {
    root.appendChild(
      el(
        "div",
        { style: "margin-top:16px" },
        alert(
          "warn",
          "This architecture is stale",
          architecture.meta.staleReason,
          button("Regenerate", {
            small: true,
            onClick: () => {
              void store.regenerate("architecture").then(() => rerender());
            },
          }),
        ),
      ),
    );
  }

  root.appendChild(
    block(
      `${CLOUD_LABEL[architecture.cloud]} \u2014 summary`,
      el("p", {
        style: "font-size:13px;max-width:78ch",
        text: architecture.summary,
      }),
    ),
  );

  const selectedId = store.state.selection["component"] ?? null;
  const selected =
    architecture.components.find((c) => c.id === selectedId) ?? null;

  const diagramBlock = el("div");
  diagramBlock.appendChild(
    architectureDiagram(architecture, selectedId, (component) => {
      store.select("component", component.id);
      rerender();
    }),
  );
  diagramBlock.appendChild(
    el("p", {
      class: "notice",
      text: "Select a component to see its rationale, trade-offs and linked requirements. The same graph is exported as Mermaid in the package.",
    }),
  );
  root.appendChild(block("Diagram", diagramBlock));

  if (selected) {
    root.appendChild(
      block(
        `${selected.id} \u2014 ${selected.name}`,
        panel(
          selected.cloudService,
          el(
            "div",
            {},
            kv([
              ["Layer", selected.layer],
              ["Purpose", selected.purpose],
              ["Rationale", selected.rationale],
              ["Security", selected.securityNotes],
              ["Scalability", selected.scalabilityNotes],
              ["Deployment", selected.deploymentNotes],
              [
                "Trade-offs",
                selected.tradeoffs.join(" \u00b7 ") || "None recorded",
              ],
              [
                "Justified by",
                selected.requirementIds.length > 0
                  ? selected.requirementIds.join(", ")
                  : "No linked requirement",
              ],
            ]),
            selected.requirementIds.length === 0
              ? el(
                  "div",
                  { style: "margin-top:12px" },
                  alert(
                    "warn",
                    "No requirement justifies this component",
                    "It may still be correct as a platform necessity, but it adds cost with no traceable customer driver.",
                  ),
                )
              : null,
          ),
          provenanceChip(selected.provenance),
        ),
      ),
    );
  }

  root.appendChild(
    block(
      "Components",
      dataTable({
        columns: [
          {
            key: "id",
            header: "ID",
            width: "82px",
            render: (c) =>
              idLink(c.id, () => {
                store.select("component", c.id);
                rerender();
              }),
          },
          { key: "name", header: "Component", render: (c) => c.name },
          {
            key: "layer",
            header: "Layer",
            width: "120px",
            render: (c) => c.layer,
          },
          {
            key: "tradeoffs",
            header: "Key trade-off",
            render: (c) =>
              el("div", { class: "wrap", text: c.tradeoffs[0] ?? "\u2014" }),
          },
          {
            key: "reqs",
            header: "Justified by",
            width: "180px",
            render: (c) =>
              c.requirementIds.length > 0
                ? el("span", { class: "id", text: c.requirementIds.join(", ") })
                : chip("warn", "\u25B3", "None"),
          },
        ],
        rows: architecture.components,
        rowId: (c) => c.id,
        selectedId,
        onSelect: (c) => {
          store.select("component", c.id);
          rerender();
        },
      }),
    ),
  );

  if (architecture.crossCuttingConcerns.length > 0) {
    const list = el("ul", {
      style: "margin:0;padding-left:20px;font-size:13px",
    });
    for (const concern of architecture.crossCuttingConcerns)
      list.appendChild(el("li", { text: concern }));
    root.appendChild(block("Cross-cutting concerns", list));
  }

  return root;
}
