import { el } from "../dom";
import { Store } from "../state";
import {
  alert,
  block,
  button,
  chip,
  emptyState,
  idLink,
  panel,
} from "../components/primitives";
import { dataTable } from "../components/table";
import { toast } from "../components/toast";
import { ARTIFACT_LABEL, ArtifactKind } from "../../domain/artifacts";

export function changesView(store: Store, rerender: () => void): HTMLElement {
  const { model } = store.state;
  const root = el("div");

  root.appendChild(
    el(
      "div",
      { class: "page-head" },
      el("h1", { text: "Change impact" }),
      el("p", {
        text: "Impact is decided by a declarative rule table and by direct reference intersection. Every flag cites the rule that produced it, and artifacts nothing reached are confirmed current rather than regenerated.",
      }),
    ),
  );

  // ---- staged change ----
  const pending = store.state.pendingChange;
  if (pending) {
    const preview = store.previewPendingChange();
    const body = el("div");
    body.appendChild(
      el("p", { style: "font-size:13px", text: pending.summary }),
    );

    if (preview && preview.changeSet.entries.length > 0) {
      const diff = el("div", { class: "diff" });
      for (const entry of preview.changeSet.entries.slice(0, 8)) {
        diff.appendChild(
          el(
            "div",
            { class: "side before" },
            el("div", {
              class: "k",
              text: `${entry.entityKind}.${entry.field} \u2014 before`,
            }),
            el("div", { class: "v", text: entry.before || "(empty)" }),
          ),
        );
        diff.appendChild(
          el(
            "div",
            { class: "side after" },
            el("div", {
              class: "k",
              text: `${entry.entityKind}.${entry.field} \u2014 after`,
            }),
            el("div", { class: "v", text: entry.after || "(empty)" }),
          ),
        );
      }
      body.appendChild(diff);
    }

    if (preview) {
      body.appendChild(impactSummary(preview, store, rerender, false));
    }

    body.appendChild(
      el(
        "div",
        { style: "display:flex;gap:8px;margin-top:16px" },
        button("Apply change", {
          variant: "primary",
          onClick: () => {
            const analysis = store.applyPendingChange();
            toast(
              "ok",
              "Change applied",
              analysis
                ? `${analysis.affected.length} artifact(s) flagged, ${analysis.confirmedCurrent.length} confirmed current.`
                : "",
            );
            rerender();
          },
        }),
        button("Discard", {
          onClick: () => {
            store.cancelPendingChange();
            rerender();
          },
        }),
      ),
    );

    root.appendChild(
      block(
        "Staged change \u2014 not yet applied",
        panel("Impact preview", body),
      ),
    );
  }

  // ---- last applied impact ----
  const last = store.state.lastImpact;
  if (last) {
    root.appendChild(
      block(
        `Last applied change \u2014 v${last.changeSet.previousVersion} to v${last.changeSet.version}`,
        panel(
          last.changeSet.summary,
          impactSummary(last, store, rerender, true),
        ),
      ),
    );
  } else if (!pending) {
    root.appendChild(
      emptyState(
        "No change has been analysed yet",
        "Edit a requirement or change an estimation input. The change is staged, its impact is shown before it is applied, and only the artifacts it actually reaches are flagged.",
      ),
    );
  }

  // ---- version history ----
  if (model.history.length > 0) {
    root.appendChild(
      block(
        "Version history",
        dataTable({
          columns: [
            {
              key: "v",
              header: "Version",
              width: "90px",
              render: (h) => el("span", { class: "id", text: `v${h.version}` }),
              sortValue: (h) => h.version,
            },
            {
              key: "summary",
              header: "Change",
              render: (h) => el("div", { class: "wrap", text: h.summary }),
            },
            {
              key: "entries",
              header: "Fields",
              numeric: true,
              width: "80px",
              render: (h) => String(h.entries.length),
              sortValue: (h) => h.entries.length,
            },
            {
              key: "entities",
              header: "Entities touched",
              width: "220px",
              render: (h) =>
                el("span", {
                  class: "id",
                  text:
                    h.touchedEntityIds.slice(0, 5).join(", ") +
                    (h.touchedEntityIds.length > 5
                      ? ` +${h.touchedEntityIds.length - 5}`
                      : ""),
                }),
            },
            {
              key: "at",
              header: "When",
              width: "170px",
              render: (h) => new Date(h.at).toLocaleString(),
              sortValue: (h) => h.at,
            },
          ],
          rows: [...model.history].reverse(),
          rowId: (h) => String(h.version),
          selectedId: store.state.selection["version"] ?? null,
          onSelect: (h) => {
            store.select(
              "version",
              store.state.selection["version"] === String(h.version)
                ? null
                : String(h.version),
            );
            rerender();
          },
        }),
      ),
    );

    const selectedVersion = store.state.selection["version"];
    const entry = model.history.find(
      (h) => String(h.version) === selectedVersion,
    );
    if (entry) {
      root.appendChild(
        block(
          `v${entry.version} \u2014 field-level changes`,
          dataTable({
            columns: [
              {
                key: "entity",
                header: "Entity",
                width: "110px",
                render: (e) => idLink(e.entityId),
              },
              {
                key: "kind",
                header: "Kind",
                width: "120px",
                render: (e) => e.entityKind,
              },
              {
                key: "field",
                header: "Field",
                width: "140px",
                render: (e) => e.field,
              },
              {
                key: "op",
                header: "Operation",
                width: "100px",
                render: (e) => e.operation,
              },
              {
                key: "before",
                header: "Before",
                render: (e) =>
                  el("div", { class: "wrap", text: truncate(e.before) }),
              },
              {
                key: "after",
                header: "After",
                render: (e) =>
                  el("div", { class: "wrap", text: truncate(e.after) }),
              },
            ],
            rows: entry.entries,
            rowId: (e) => `${e.entityId}.${e.field}`,
          }),
        ),
      );
    }
  }

  return root;
}

function impactSummary(
  analysis: ReturnType<Store["applyPendingChange"]> extends infer T
    ? NonNullable<T>
    : never,
  store: Store,
  rerender: () => void,
  allowRegenerate: boolean,
): HTMLElement {
  const body = el("div");

  if (analysis.firedRules.length > 0) {
    body.appendChild(
      el("h3", {
        style: "font-size:12px;margin:16px 0 6px",
        text: `Rules fired (${analysis.firedRules.length})`,
      }),
    );
    body.appendChild(
      dataTable({
        columns: [
          {
            key: "id",
            header: "Rule",
            width: "160px",
            render: (f) => el("span", { class: "id", text: f.rule.id }),
          },
          {
            key: "trigger",
            header: "Trigger",
            width: "220px",
            render: (f) => f.field,
          },
          {
            key: "change",
            header: "Change",
            width: "180px",
            render: (f) =>
              `${f.before || "(empty)"} \u2192 ${f.after || "(empty)"}`,
          },
          {
            key: "reason",
            header: "Why it matters",
            render: (f) => el("div", { class: "wrap", text: f.rule.reason }),
          },
        ],
        rows: analysis.firedRules,
        rowId: (f) => `${f.rule.id}-${f.field}`,
      }),
    );
  }

  if (analysis.affected.length > 0) {
    body.appendChild(
      el("h3", {
        style: "font-size:12px;margin:16px 0 6px",
        text: `Affected artifacts (${analysis.affected.length})`,
      }),
    );
    for (const affected of analysis.affected) {
      const tone =
        affected.severity === "high"
          ? "stop"
          : affected.severity === "medium"
            ? "warn"
            : "info";
      const action = allowRegenerate
        ? button("Regenerate this only", {
            small: true,
            onClick: () => {
              void store
                .regenerate(affected.kind as ArtifactKind)
                .then((ok) => {
                  toast(
                    ok ? "ok" : "stop",
                    ok
                      ? `${ARTIFACT_LABEL[affected.kind as ArtifactKind]} regenerated`
                      : "Regeneration failed",
                    ok
                      ? "Only this artifact was rebuilt; the others were left untouched."
                      : "",
                  );
                  rerender();
                });
            },
          })
        : undefined;
      body.appendChild(
        alert(
          tone as "stop" | "warn" | "info",
          `${affected.label} \u2014 ${affected.severity} impact`,
          `${affected.reasons.join(" ")} Rules: ${[...new Set(affected.ruleIds)].join(", ")}.`,
          action,
        ),
      );
    }
  } else {
    body.appendChild(
      alert(
        "ok",
        "No artifact is affected",
        "No impact rule fired and no referenced requirement changed.",
      ),
    );
  }

  if (analysis.confirmedCurrent.length > 0) {
    body.appendChild(
      el("h3", {
        style: "font-size:12px;margin:16px 0 6px",
        text: "Confirmed current",
      }),
    );
    const row = el("div", { class: "legend-row" });
    for (const confirmed of analysis.confirmedCurrent) {
      row.appendChild(chip("ok", "\u2713", confirmed.label, confirmed.reason));
    }
    body.appendChild(row);
    body.appendChild(
      el("p", {
        class: "notice",
        text: "These artifacts were left exactly as they were. Regenerating them would discard reviewed content for no reason.",
      }),
    );
  }

  if (analysis.affectedAssumptionIds.length > 0) {
    body.appendChild(
      alert(
        "warn",
        `${analysis.affectedAssumptionIds.length} approved assumption(s) need revalidation`,
        `They cite volume or scale, which this change moved: ${analysis.affectedAssumptionIds.join(", ")}.`,
      ),
    );
  }

  return body;
}

function truncate(value: string): string {
  return value.length > 120 ? `${value.slice(0, 117)}\u2026` : value;
}
