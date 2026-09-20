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
} from "../components/primitives";
import { dataTable } from "../components/table";

/** Data, integration and AI strategy. Missing sections stay visibly missing. */
export function solutionView(store: Store, rerender: () => void): HTMLElement {
  const { model, artifacts } = store.state;
  const root = el("div");
  const busy = store.state.busy?.key === "solution";

  root.appendChild(
    el(
      "div",
      { class: "page-head" },
      el("h1", { text: "Solution design" }),
      el("p", {
        text: "Data strategy, integration architecture and AI strategy. Each is generated independently; if one fails it is left empty rather than filled with placeholder content.",
      }),
      el(
        "div",
        { class: "actions" },
        button(busy ? "Generating\u2026" : "Generate solution design", {
          variant: "primary",
          disabled: !model.approval.scopeApproved || busy,
          disabledReason: model.approval.scopeApproved
            ? "Generation is running."
            : "Approve the scope model first.",
          onClick: () => {
            void store.generateSolutionDesign().then(() => rerender());
          },
        }),
      ),
    ),
  );

  if (store.state.lastError) {
    root.appendChild(
      alert(
        store.state.lastError.title === "Partial generation" ? "warn" : "stop",
        store.state.lastError.title,
        store.state.lastError.detail,
      ),
    );
  }

  if (
    !artifacts.dataStrategy &&
    !artifacts.integrations &&
    !artifacts.aiStrategy
  ) {
    root.appendChild(
      emptyState(
        "No solution design generated yet",
        model.approval.scopeApproved
          ? "Generation derives all three sections from the approved scope model."
          : "Approve the scope model on the requirements screen first.",
      ),
    );
    return root;
  }

  // ---- data strategy ----
  if (artifacts.dataStrategy) {
    const data = artifacts.dataStrategy;
    const body = el("div");
    if (data.meta.stale)
      body.appendChild(alert("warn", "Stale", data.meta.staleReason));
    body.appendChild(
      dataTable({
        columns: [
          {
            key: "id",
            header: "ID",
            width: "82px",
            render: (d) => idLink(d.id),
          },
          { key: "name", header: "Domain", render: (d) => d.name },
          {
            key: "owner",
            header: "Owner",
            width: "150px",
            render: (d) =>
              d.owner === "To be confirmed"
                ? chip("warn", "\u25B3", "To be confirmed")
                : d.owner,
          },
          {
            key: "class",
            header: "Classification",
            width: "130px",
            render: (d) => d.classification,
          },
          {
            key: "retention",
            header: "Retention",
            width: "110px",
            render: (d) => d.retention || "\u2014",
          },
          {
            key: "reqs",
            header: "Requirements",
            width: "160px",
            render: (d) =>
              d.requirementIds.length > 0
                ? el("span", { class: "id", text: d.requirementIds.join(", ") })
                : chip("warn", "\u25B3", "None"),
          },
          {
            key: "origin",
            header: "Origin",
            width: "150px",
            render: (d) => provenanceChip(d.provenance),
          },
        ],
        rows: data.domains,
        rowId: (d) => d.id,
      }),
    );
    body.appendChild(
      el("h3", {
        style: "font-size:13px;margin:16px 0 6px",
        text: "Governance",
      }),
    );
    body.appendChild(bullets(data.governance));
    body.appendChild(
      el("h3", { style: "font-size:13px;margin:16px 0 6px", text: "Privacy" }),
    );
    body.appendChild(bullets(data.privacy));
    body.appendChild(
      el("p", {
        class: "notice",
        text: `Backup and recovery: ${data.backupRecovery}`,
      }),
    );
    body.appendChild(
      el("p", { class: "notice", text: `Reporting: ${data.reporting}` }),
    );
    root.appendChild(block("Data strategy", body));
  } else {
    root.appendChild(
      block(
        "Data strategy",
        alert(
          "warn",
          "Not generated",
          "This section could not be generated and has deliberately been left empty.",
        ),
      ),
    );
  }

  // ---- integrations ----
  if (artifacts.integrations) {
    const integration = artifacts.integrations;
    const body = el("div");
    if (integration.meta.stale)
      body.appendChild(alert("warn", "Stale", integration.meta.staleReason));
    body.appendChild(
      dataTable({
        columns: [
          {
            key: "id",
            header: "ID",
            width: "82px",
            render: (i) => idLink(i.id),
          },
          { key: "name", header: "Integration", render: (i) => i.name },
          {
            key: "protocol",
            header: "Protocol",
            width: "100px",
            render: (i) => i.protocol.toUpperCase(),
          },
          {
            key: "direction",
            header: "Direction",
            width: "120px",
            render: (i) => i.direction,
          },
          {
            key: "auth",
            header: "Authentication",
            render: (i) => el("div", { class: "wrap", text: i.authentication }),
          },
          {
            key: "reqs",
            header: "Requirements",
            width: "150px",
            render: (i) =>
              el("span", {
                class: "id",
                text: i.requirementIds.join(", ") || "\u2014",
              }),
          },
        ],
        rows: integration.integrations,
        rowId: (i) => i.id,
        onSelect: (i) => {
          store.select(
            "integration",
            store.state.selection["integration"] === i.id ? null : i.id,
          );
          rerender();
        },
        selectedId: store.state.selection["integration"] ?? null,
      }),
    );
    const selectedIntegration = integration.integrations.find(
      (i) => i.id === store.state.selection["integration"],
    );
    if (selectedIntegration) {
      body.appendChild(
        el(
          "div",
          { class: "panel", style: "margin-top:12px" },
          el(
            "div",
            { class: "body" },
            el("p", {
              style: "font-size:13px",
              text: `Error handling: ${selectedIntegration.errorHandling}`,
            }),
            el("p", {
              style: "font-size:13px",
              text: `Retry: ${selectedIntegration.retryBehaviour}`,
            }),
            el("p", {
              style: "font-size:13px",
              text: `Monitoring: ${selectedIntegration.monitoring}`,
            }),
          ),
        ),
      );
    }
    body.appendChild(
      el("p", {
        class: "notice",
        text: `The estimate applies an integration factor derived from the declared external system count (${model.configuration.externalSystemCount}), not from this inventory. Change it on the estimation screen to see the impact.`,
      }),
    );
    root.appendChild(block("Integration architecture", body));
  } else {
    root.appendChild(
      block(
        "Integration architecture",
        alert(
          "warn",
          "Not generated",
          "This section could not be generated and has deliberately been left empty.",
        ),
      ),
    );
  }

  // ---- AI strategy ----
  if (artifacts.aiStrategy) {
    const ai = artifacts.aiStrategy;
    const body = el("div");
    if (ai.meta.stale)
      body.appendChild(alert("warn", "Stale", ai.meta.staleReason));
    if (ai.useCases.length === 0) {
      body.appendChild(
        alert(
          "info",
          "No AI use case was identified",
          "Nothing in the customer material describes a problem that needs a model. Recommending one anyway would add cost without a driver.",
        ),
      );
    } else {
      body.appendChild(
        dataTable({
          columns: [
            {
              key: "id",
              header: "ID",
              width: "82px",
              render: (u) => idLink(u.id),
            },
            {
              key: "name",
              header: "Use case",
              render: (u) => el("div", { class: "wrap", text: u.name }),
            },
            {
              key: "pattern",
              header: "Pattern",
              width: "130px",
              render: (u) => u.pattern,
            },
            {
              key: "review",
              header: "Human review",
              render: (u) => el("div", { class: "wrap", text: u.humanReview }),
            },
            {
              key: "reqs",
              header: "Requirements",
              width: "140px",
              render: (u) =>
                el("span", {
                  class: "id",
                  text: u.requirementIds.join(", ") || "\u2014",
                }),
            },
          ],
          rows: ai.useCases,
          rowId: (u) => u.id,
        }),
      );
    }
    body.appendChild(
      el("h3", {
        style: "font-size:13px;margin:16px 0 6px",
        text: "Model options",
      }),
    );
    body.appendChild(bullets(ai.modelOptions));
    body.appendChild(
      el("h3", {
        style: "font-size:13px;margin:16px 0 6px",
        text: "Responsible AI",
      }),
    );
    body.appendChild(bullets(ai.responsibleAi));
    body.appendChild(
      el("h3", {
        style: "font-size:13px;margin:16px 0 6px",
        text: "Monitoring",
      }),
    );
    body.appendChild(bullets(ai.monitoring));
    root.appendChild(block("AI strategy", body));
  } else {
    root.appendChild(
      block(
        "AI strategy",
        alert(
          "warn",
          "Not generated",
          "This section could not be generated and has deliberately been left empty.",
        ),
      ),
    );
  }

  return root;
}

function bullets(items: readonly string[]): HTMLElement {
  const list = el("ul", { style: "margin:0;padding-left:20px;font-size:13px" });
  for (const item of items) list.appendChild(el("li", { text: item }));
  return list;
}
