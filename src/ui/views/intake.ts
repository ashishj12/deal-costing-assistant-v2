import { el, clear } from "../dom";
import { Store } from "../state";
import {
  alert,
  block,
  button,
  field,
  idLink,
  select,
} from "../components/primitives";
import { dataTable } from "../components/table";
import { toast } from "../components/toast";
import { scenarioList } from "../../data/scenarios";

const MAX_FILE_BYTES = 2_000_000;
const ACCEPTED = [".txt", ".md", ".markdown", ".json", ".csv"];

export function intakeView(store: Store, rerender: () => void): HTMLElement {
  const { model } = store.state;
  const root = el("div");
  const errors: Record<string, string> = {};

  root.appendChild(
    el(
      "div",
      { class: "page-head" },
      el("h1", { text: "Customer intake" }),
      el("p", {
        text: "Capture the opportunity context and the customer material the scope will be derived from. Extraction reads only what you provide here; it never invents a requirement.",
      }),
    ),
  );

  if (model.sources.length === 0 && model.requirements.length === 0) {
    root.appendChild(
      alert(
        "info",
        "Start from the seeded scenario if you want to see the full workflow",
        "The Northwind Logistics scenario contains three source documents with contradictory statements, an explicit exclusion and a prompt injection attempt, so every defence in the pipeline is demonstrable.",
        button("Load seeded scenario", {
          onClick: () => {
            store.loadSeed();
            rerender();
            toast(
              "ok",
              "Seeded scenario loaded",
              "Three source documents ingested. Run extraction next.",
            );
          },
        }),
      ),
    );
  }

  // ---- sample scenarios (work fully offline in mock AI mode) ----
  const scenarioBody = el("div", { class: "scenario-grid" });
  for (const scenario of scenarioList()) {
    scenarioBody.appendChild(
      el(
        "div",
        { class: "panel" },
        el(
          "div",
          { class: "body" },
          el("strong", { text: scenario.title }),
          el("p", {
            class: "hint",
            text: `${scenario.shape}. ${scenario.summary}`,
          }),
          button("Load this scenario", {
            small: true,
            onClick: () => {
              store.loadSeed(scenario.id);
              rerender();
              toast(
                "ok",
                "Scenario loaded",
                `${scenario.title}: sources ingested. Run extraction next.`,
              );
            },
          }),
        ),
      ),
    );
  }
  root.appendChild(block("Sample scenarios", scenarioBody));

  // ---- opportunity context ----
  const contextBody = el("div");
  const nameInput = el("input", {
    type: "text",
    value: model.customer.customerName,
    placeholder: "Northwind Logistics",
  });
  nameInput.addEventListener("input", () =>
    store.updateCustomer({ customerName: nameInput.value }),
  );
  const oppInput = el("input", {
    type: "text",
    value: model.customer.opportunityName,
    placeholder: "Carrier Portal Modernisation",
  });
  oppInput.addEventListener("input", () => {
    store.updateCustomer({ opportunityName: oppInput.value });
    store.updateProjectName(oppInput.value || "Untitled opportunity");
  });
  const industryInput = el("input", {
    type: "text",
    value: model.customer.industry,
    placeholder: "Transport and logistics",
  });
  industryInput.addEventListener("input", () =>
    store.updateCustomer({ industry: industryInput.value }),
  );
  const objectivesInput = el("textarea", {
    placeholder: "One objective per line",
    style: "min-height:96px",
  });
  objectivesInput.value = model.customer.businessObjectives.join("\n");
  objectivesInput.addEventListener("input", () => {
    store.updateCustomer({
      businessObjectives: objectivesInput.value
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length >= 3),
    });
  });

  contextBody.appendChild(
    el(
      "div",
      { class: "grid-2" },
      el(
        "div",
        {},
        field(
          "Customer",
          nameInput,
          "",
          model.customer.customerName.trim() === ""
            ? "Required before the package can be exported."
            : "",
        ),
        field(
          "Opportunity",
          oppInput,
          "",
          model.customer.opportunityName.trim() === ""
            ? "Required before the package can be exported."
            : "",
        ),
      ),
      el(
        "div",
        {},
        field(
          "Industry",
          industryInput,
          "Used to calibrate assumptions; optional.",
        ),
        field(
          "Business objectives",
          objectivesInput,
          "One per line. These appear verbatim in the PRD and the package.",
        ),
        field(
          "Opportunity status",
          select(
            [
              { value: "qualifying", label: "Qualifying" },
              { value: "scoping", label: "Scoping" },
              { value: "proposal", label: "Proposal" },
              { value: "negotiation", label: "Negotiation" },
            ],
            model.customer.opportunityStatus,
            (v) => store.updateCustomer({ opportunityStatus: v as never }),
          ),
          "",
        ),
      ),
    ),
  );
  root.appendChild(block("Opportunity context", contextBody));

  // ---- source material ----
  const pasteArea = el("textarea", {
    placeholder:
      "Paste requirement text, an RFP extract, discovery notes or an email thread. Plain text or Markdown.",
  });
  const pasteName = el("input", {
    type: "text",
    placeholder: "Name for this source (optional)",
  });
  const errorSlot = el("div");

  const addPasted = (): void => {
    clear(errorSlot);
    const result = store.addSource(
      pasteName.value.trim() || "Pasted text",
      "pasted-text",
      pasteArea.value,
    );
    if (!result.ok) {
      errorSlot.appendChild(
        alert("stop", "Nothing was ingested", result.message),
      );
      return;
    }
    pasteArea.value = "";
    pasteName.value = "";
    toast("ok", "Source ingested", result.message);
    rerender();
  };

  const fileInput = el("input", {
    type: "file",
    accept: ACCEPTED.join(","),
    multiple: true,
  });
  fileInput.addEventListener("change", () => {
    clear(errorSlot);
    const files = Array.from(fileInput.files ?? []);
    if (files.length === 0) return;
    let pending = files.length;
    for (const file of files) {
      const extension = `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`;
      if (!ACCEPTED.includes(extension)) {
        errorSlot.appendChild(
          alert(
            "stop",
            `${file.name} was not ingested`,
            `Unsupported file type "${extension}". This build reads text formats only: ${ACCEPTED.join(", ")}. PDF and DOCX parsing is a documented limitation.`,
          ),
        );
        pending -= 1;
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        errorSlot.appendChild(
          alert(
            "stop",
            `${file.name} was not ingested`,
            `File is ${(file.size / 1_000_000).toFixed(1)} MB, above the 2 MB limit.`,
          ),
        );
        pending -= 1;
        continue;
      }
      const reader = new FileReader();
      reader.onerror = () => {
        errorSlot.appendChild(
          alert(
            "stop",
            `${file.name} could not be read`,
            "The file could not be decoded as text. It may be corrupted or in a binary format.",
          ),
        );
        pending -= 1;
        if (pending === 0) rerender();
      };
      reader.onload = () => {
        const content = String(reader.result ?? "");
        const kind =
          extension === ".md" || extension === ".markdown" ? "md" : "txt";
        const result = store.addSource(file.name, kind, content);
        if (!result.ok)
          errorSlot.appendChild(
            alert("warn", `${file.name} was not ingested`, result.message),
          );
        else toast("ok", "Source ingested", result.message);
        pending -= 1;
        if (pending === 0) rerender();
      };
      reader.readAsText(file);
    }
    fileInput.value = "";
    if (pending === 0) rerender();
  });

  const sourceBody = el(
    "div",
    { class: "grid-2" },
    el(
      "div",
      {},
      field(
        "Paste customer material",
        pasteArea,
        "Whitespace-only input is rejected. Identical content cannot be ingested twice.",
      ),
      field("Source name", pasteName),
      button("Add source", { variant: "primary", onClick: addPasted }),
    ),
    el(
      "div",
      {},
      field(
        "Or upload files",
        fileInput,
        `Text formats only (${ACCEPTED.join(", ")}), 2 MB per file.`,
        errors["file"] ?? "",
      ),
      errorSlot,
    ),
  );
  root.appendChild(block("Source material", sourceBody));

  if (model.sources.length > 0) {
    const table = dataTable({
      columns: [
        {
          key: "id",
          header: "ID",
          width: "88px",
          render: (s) => idLink(s.id),
          sortValue: (s) => s.id,
        },
        {
          key: "name",
          header: "Source",
          render: (s) => s.name,
          sortValue: (s) => s.name,
        },
        { key: "kind", header: "Kind", width: "96px", render: (s) => s.kind },
        {
          key: "bytes",
          header: "Characters",
          numeric: true,
          width: "110px",
          render: (s) => s.bytes.toLocaleString("en-US"),
          sortValue: (s) => s.bytes,
        },
        {
          key: "checksum",
          header: "Checksum",
          width: "100px",
          render: (s) => el("span", { class: "id", text: s.checksum }),
        },
        {
          key: "actions",
          header: "",
          width: "84px",
          sortable: false,
          render: (s) =>
            button("Remove", {
              small: true,
              onClick: () => {
                if (
                  confirm(
                    `Remove ${s.name}? Requirements already extracted from it will keep their citations, which will then fail to resolve and be flagged by the quality gate.`,
                  )
                ) {
                  store.removeSource(s.id);
                  rerender();
                }
              },
            }),
        },
      ],
      rows: model.sources,
      rowId: (s) => s.id,
    });
    root.appendChild(
      block(`Ingested sources (${model.sources.length})`, table),
    );
  }

  // ---- extraction ----
  const busy = store.state.busy?.key === "extract";
  const canExtract = model.sources.length > 0 && !busy;
  const extractBody = el("div");

  if (store.state.lastError) {
    extractBody.appendChild(
      alert(
        "stop",
        store.state.lastError.title,
        `${store.state.lastError.detail}${store.state.lastError.retryable ? " You can retry." : ""}`,
      ),
    );
  }
  if (store.state.injectionFindings.length > 0) {
    extractBody.appendChild(
      alert(
        "warn",
        `${store.state.injectionFindings.length} possible prompt injection attempt(s) found in source material`,
        `Recorded as quoted content only and not acted on. Example from ${store.state.injectionFindings[0]?.sourceId}: "${store.state.injectionFindings[0]?.excerpt.slice(0, 120)}"`,
      ),
    );
  }
  if (store.state.downgraded.length > 0) {
    extractBody.appendChild(
      alert(
        "warn",
        `${store.state.downgraded.length} requirement(s) downgraded from customer-stated to inferred`,
        "Their quotations did not resolve against the source text, so they are not presented as customer commitments.",
      ),
    );
  }

  extractBody.appendChild(
    el("p", {
      class: "notice",
      text:
        model.requirements.length > 0
          ? `Extraction has already run. Running it again appends newly found requirements and creates a new scope version; it does not overwrite reviewed ones.`
          : "Extraction classifies each statement, assigns a priority from its wording, and resolves every quotation against the original source before marking it customer-stated.",
    }),
  );
  extractBody.appendChild(
    el(
      "div",
      { class: "actions", style: "display:flex;gap:8px;margin-top:12px" },
      button(busy ? "Extracting\u2026" : "Extract requirements", {
        variant: "primary",
        disabled: !canExtract,
        disabledReason:
          model.sources.length === 0
            ? "Add at least one source document first."
            : "Extraction is running.",
        onClick: () => {
          void store.extract().then((ok) => {
            if (ok) {
              toast(
                "ok",
                "Extraction complete",
                "Review the extracted requirements.",
              );
              location.hash = "#/requirements";
            }
          });
        },
      }),
      model.requirements.length > 0
        ? button("Go to requirements", {
            onClick: () => {
              location.hash = "#/requirements";
            },
          })
        : null,
    ),
  );
  root.appendChild(block("Extraction", extractBody));

  return root;
}
