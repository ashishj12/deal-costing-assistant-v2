import { el } from "../dom";
import { Store } from "../state";
import {
  alert,
  block,
  button,
  chip,
  emptyState,
  idLink,
} from "../components/primitives";
import { dataTable } from "../components/table";
import { toast } from "../components/toast";
import { GATE_LABEL } from "../../engines/quality-gate";
import {
  packageSections,
  PACKAGE_DISCLAIMER,
} from "../../export/package-model";
import { renderPackageMarkdown } from "../../export/markdown";

export function deliverablesView(
  store: Store,
  rerender: () => void,
): HTMLElement {
  const root = el("div");
  const pkg = store.packageModel();
  const quality = pkg.quality;

  root.appendChild(
    el(
      "div",
      { class: "page-head" },
      el("h1", { text: "Quality gate and package" }),
      el("p", {
        text: "Every check states what is wrong, why it matters and what to do about it. Nothing is exported as validated while a blocking check is open.",
      }),
    ),
  );

  const tone =
    quality.status === "READY"
      ? "ok"
      : quality.status === "BLOCKED"
        ? "stop"
        : "warn";
  const glyph =
    quality.status === "READY"
      ? "\u2713"
      : quality.status === "BLOCKED"
        ? "\u2715"
        : "\u25B3";
  root.appendChild(
    el(
      "div",
      { class: "legend-row" },
      chip(tone, glyph, `Quality gate: ${GATE_LABEL[quality.status]}`),
      chip("stop", "\u2715", `${quality.blocking} blocking`),
      chip("warn", "\u25B3", `${quality.warnings} warning`),
      chip("ok", "\u2713", `${quality.passed} passing`),
    ),
  );

  const checks = quality.checks.filter((c) => c.severity !== "pass");
  if (checks.length === 0) {
    root.appendChild(
      block(
        "Checks",
        alert(
          "ok",
          "All checks pass",
          "There is nothing outstanding on the quality gate.",
        ),
      ),
    );
  } else {
    root.appendChild(
      block(
        "Checks",
        dataTable({
          columns: [
            {
              key: "id",
              header: "Check",
              width: "200px",
              render: (c) => el("span", { class: "id", text: c.checkId }),
            },
            {
              key: "sev",
              header: "Severity",
              width: "110px",
              render: (c) =>
                c.severity === "blocking"
                  ? chip("stop", "\u2715", "Blocking")
                  : chip("warn", "\u25B3", "Warning"),
              sortValue: (c) => c.severity,
            },
            {
              key: "what",
              header: "What is wrong",
              render: (c) => el("div", { class: "wrap", text: c.title }),
            },
            {
              key: "why",
              header: "Why it matters",
              render: (c) => el("div", { class: "wrap", text: c.whyItMatters }),
            },
            {
              key: "do",
              header: "What to do",
              render: (c) =>
                el("div", { class: "wrap", text: c.recommendedAction }),
            },
            {
              key: "go",
              header: "",
              width: "80px",
              sortable: false,
              render: (c) =>
                button("Open", {
                  small: true,
                  onClick: () => {
                    location.hash = c.route;
                  },
                }),
            },
          ],
          rows: checks,
          rowId: (c) => c.checkId,
        }),
      ),
    );
  }

  // ---- package preview ----
  const sections = packageSections(pkg);
  const sectionList = el("div", { class: "readiness" });
  for (const section of sections) {
    sectionList.appendChild(
      el(
        "div",
        { class: "cell" },
        el("div", { class: "k", text: section.title }),
        el(
          "div",
          { class: "v", style: "font-size:13px" },
          section.present
            ? chip("ok", "\u2713", "Included")
            : chip("warn", "\u25B3", "Missing"),
        ),
        el("div", { class: "n", text: section.note || "" }),
      ),
    );
  }
  root.appendChild(block("Package contents", sectionList));

  if (pkg.model.requirements.length === 0) {
    root.appendChild(
      emptyState(
        "Nothing to export yet",
        "Capture requirements and generate at least the PRD before exporting a package.",
      ),
    );
    return root;
  }

  const markdown = renderPackageMarkdown(pkg);
  const exportBody = el("div");

  if (quality.status === "BLOCKED") {
    exportBody.appendChild(
      alert(
        "stop",
        "This package is not validated",
        "It can be exported for internal review, and every exported copy carries a validation-status section listing each blocking issue. It must not be sent to a customer in this state.",
      ),
    );
  }
  exportBody.appendChild(
    el("p", { class: "notice", text: PACKAGE_DISCLAIMER }),
  );

  exportBody.appendChild(
    el(
      "div",
      { style: "display:flex;gap:8px;flex-wrap:wrap;margin:12px 0" },
      button("Download Markdown", {
        variant: "primary",
        onClick: () => {
          download(
            `${slug(pkg.model.customer.opportunityName || pkg.model.projectName)}-scoping-package-v${pkg.model.version}.md`,
            markdown,
            "text/markdown",
          );
          toast(
            "ok",
            "Package downloaded",
            "The Markdown file is the canonical export; other formats are rendered from it.",
          );
        },
      }),
      button("Copy Markdown", {
        onClick: () => {
          void navigator.clipboard?.writeText(markdown).then(
            () => toast("ok", "Copied to clipboard", ""),
            () =>
              toast(
                "stop",
                "Copy failed",
                "Your browser blocked clipboard access. Use the download button instead.",
              ),
          );
        },
      }),
      button("Download scope model (JSON)", {
        onClick: () => {
          download(
            `${slug(pkg.model.projectName)}-scope-model-v${pkg.model.version}.json`,
            JSON.stringify(
              { model: pkg.model, artifacts: store.state.artifacts },
              null,
              2,
            ),
            "application/json",
          );
        },
      }),
      button("Word (.docx)", {
        disabled: true,
        disabledReason:
          "DOCX and PDF rendering require the optional `docx` dependency and a server-side render step. Both are generated from this same Markdown.",
      }),
      button("PDF", {
        disabled: true,
        disabledReason:
          "DOCX and PDF rendering require the optional `docx` dependency and a server-side render step. Both are generated from this same Markdown.",
      }),
    ),
  );

  const preview = el("div", { class: "mono-block" });
  preview.textContent = markdown;
  exportBody.appendChild(
    el("p", {
      class: "notice",
      text: `Preview of the exact export, ${markdown.length.toLocaleString("en-US")} characters.`,
    }),
  );
  exportBody.appendChild(preview);
  root.appendChild(block("Export", exportBody));

  const traceBody = dataTable({
    columns: [
      {
        key: "req",
        header: "Requirement",
        width: "110px",
        render: (r) =>
          idLink(r.id, () => {
            store.select("requirement", r.id);
            location.hash = "#/requirements";
          }),
      },
      {
        key: "scope",
        header: "Scope items",
        width: "160px",
        render: (r) =>
          el("span", {
            class: "id",
            text:
              pkg.model.scopeItems
                .filter((i) => i.requirementIds.includes(r.id))
                .map((i) => i.id)
                .join(", ") || "\u2014",
          }),
      },
      {
        key: "arch",
        header: "Components",
        width: "160px",
        render: (r) =>
          el("span", {
            class: "id",
            text:
              pkg.architecture?.components
                .filter((c) => c.requirementIds.includes(r.id))
                .map((c) => c.id)
                .join(", ") || "\u2014",
          }),
      },
      {
        key: "ws",
        header: "Workstreams",
        width: "160px",
        render: (r) =>
          el("span", {
            class: "id",
            text:
              pkg.estimate?.workstreams
                .filter((w) => w.requirementIds.includes(r.id))
                .map((w) => w.workstreamId)
                .join(", ") || "\u2014",
          }),
      },
      {
        key: "desc",
        header: "Requirement",
        render: (r) =>
          el("div", { class: "wrap", text: r.description.slice(0, 140) }),
      },
    ],
    rows: pkg.model.requirements,
    rowId: (r) => r.id,
  });
  root.appendChild(block("Traceability", traceBody));

  root.appendChild(
    block(
      "Workspace",
      el(
        "div",
        {},
        el("p", {
          class: "notice",
          text: "The workspace is stored in this browser only. Nothing is sent anywhere.",
        }),
        button("Reset workspace", {
          variant: "danger",
          onClick: () => {
            if (
              confirm(
                "Discard the entire workspace, including every scope version? This cannot be undone.",
              )
            ) {
              void store.reset().then(() => {
                rerender();
                toast("ok", "Workspace reset", "");
              });
            }
          },
        }),
      ),
    ),
  );

  return root;
}

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function slug(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "package"
  );
}
