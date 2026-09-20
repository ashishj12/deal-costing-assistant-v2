import { el } from "../dom";
import {
  PROVENANCE_GLYPH,
  PROVENANCE_LABEL,
  Provenance,
  ReviewStatus,
  STATUS_LABEL,
} from "../../domain/provenance";

const PROVENANCE_CLASS: Record<Provenance, string> = {
  "customer-stated": "cust",
  "ai-inferred": "inf",
  "user-assumption": "assm",
  "ai-recommendation": "rec",
  "out-of-scope": "out",
};

export function provenanceChip(
  provenance: Provenance,
  citationResolved = true,
): HTMLElement {
  const unresolved = provenance === "customer-stated" && !citationResolved;
  return el(
    "span",
    {
      class: `chip ${unresolved ? "warn" : PROVENANCE_CLASS[provenance]}`,
      title: unresolved
        ? "Marked customer-stated but the citation did not resolve against the source text."
        : PROVENANCE_LABEL[provenance],
    },
    el("span", { class: "gl", text: PROVENANCE_GLYPH[provenance] }),
    unresolved ? "Citation unresolved" : PROVENANCE_LABEL[provenance],
  );
}

const STATUS_CLASS: Record<ReviewStatus, string> = {
  draft: "neutral",
  "in-review": "warn",
  approved: "ok",
  "needs-changes": "warn",
  rejected: "stop",
};

const STATUS_GLYPH: Record<ReviewStatus, string> = {
  draft: "\u25CB",
  "in-review": "\u25D1",
  approved: "\u2713",
  "needs-changes": "\u25B3",
  rejected: "\u2715",
};

export function statusChip(status: ReviewStatus): HTMLElement {
  return el(
    "span",
    { class: `chip ${STATUS_CLASS[status]}` },
    el("span", { class: "gl", text: STATUS_GLYPH[status] }),
    STATUS_LABEL[status],
  );
}

export function chip(
  tone: "ok" | "warn" | "stop" | "neutral",
  glyph: string,
  label: string,
  title = "",
): HTMLElement {
  return el(
    "span",
    { class: `chip ${tone}`, title },
    el("span", { class: "gl", text: glyph }),
    label,
  );
}

export interface ButtonOptions {
  readonly variant?: "default" | "primary" | "danger" | "link";
  readonly small?: boolean;
  readonly disabled?: boolean;
  /** Required whenever disabled: a blocked action must explain itself. */
  readonly disabledReason?: string;
  readonly onClick?: () => void;
}

export function button(
  label: string,
  options: ButtonOptions = {},
): HTMLButtonElement {
  const classes = ["btn"];
  if (options.variant && options.variant !== "default")
    classes.push(options.variant);
  if (options.small) classes.push("small");
  const node = el(
    "button",
    {
      class: classes.join(" "),
      type: "button",
      disabled: options.disabled,
      title: options.disabled ? (options.disabledReason ?? "") : "",
      "aria-disabled": options.disabled ? "true" : "false",
    },
    label,
  );
  if (options.onClick && !options.disabled)
    node.addEventListener("click", options.onClick);
  return node;
}

export function field(
  label: string,
  control: HTMLElement,
  hint = "",
  error = "",
): HTMLElement {
  if (error) control.classList.add("invalid");
  return el(
    "label",
    { class: "field" },
    el("span", { class: "lab", text: label }),
    control,
    hint ? el("span", { class: "hint", text: hint }) : null,
    error ? el("span", { class: "field-error", text: error }) : null,
  );
}

export function select(
  options: readonly { value: string; label: string }[],
  value: string,
  onChange: (value: string) => void,
): HTMLSelectElement {
  const node = el("select", {});
  for (const option of options) {
    node.appendChild(
      el(
        "option",
        { value: option.value, selected: option.value === value },
        option.label,
      ),
    );
  }
  node.value = value;
  node.addEventListener("change", () => onChange(node.value));
  return node;
}

export function alert(
  tone: "stop" | "warn" | "ok" | "info",
  heading: string,
  body: string,
  action?: HTMLElement,
): HTMLElement {
  const glyph = {
    stop: "\u2715",
    warn: "\u25B3",
    ok: "\u2713",
    info: "\u25CF",
  }[tone];
  return el(
    "div",
    { class: `alert ${tone}` },
    el("h4", {}, el("span", { class: "gl", text: glyph }), heading),
    el("p", { text: body }),
    action ? el("div", { class: "act" }, action) : null,
  );
}

export function emptyState(
  heading: string,
  body: string,
  action?: HTMLElement,
): HTMLElement {
  return el(
    "div",
    { class: "empty" },
    el("h3", { text: heading }),
    el("p", { text: body }),
    action ?? null,
  );
}

export function skeleton(rows = 4): HTMLElement {
  const node = el("div", { class: "panel" });
  const body = el("div", { class: "body" });
  for (let i = 0; i < rows; i += 1) {
    body.appendChild(
      el("div", { class: "skeleton", style: `width:${100 - i * 9}%` }),
    );
  }
  node.appendChild(body);
  return node;
}

export function idLink(id: string, onClick?: () => void): HTMLElement {
  if (!onClick) return el("span", { class: "id", text: id });
  const node = el(
    "a",
    { class: "id", href: "javascript:void(0)", role: "button" },
    id,
  );
  node.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return node;
}

export function kv(pairs: readonly [string, Node | string][]): HTMLElement {
  const list = el("dl", { class: "kv" });
  for (const [key, value] of pairs) {
    list.appendChild(el("dt", { text: key }));
    list.appendChild(el("dd", {}, typeof value === "string" ? value : value));
  }
  return list;
}

export function panel(
  title: string,
  body: HTMLElement,
  headerExtra?: HTMLElement,
): HTMLElement {
  return el(
    "section",
    { class: "panel" },
    el("header", {}, el("h3", { text: title }), headerExtra ?? null),
    el("div", { class: "body" }, body),
  );
}

export function block(
  title: string,
  ...children: (HTMLElement | null)[]
): HTMLElement {
  return el(
    "section",
    { class: "block" },
    el("h2", { text: title }),
    ...children.filter((c): c is HTMLElement => c !== null),
  );
}
