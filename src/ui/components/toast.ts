import { el } from "../dom";

export type ToastTone = "ok" | "warn" | "stop";

let host: HTMLElement | null = null;

function ensureHost(): HTMLElement {
  if (!host) {
    host = el("div", {
      class: "toasts",
      role: "status",
      "aria-live": "polite",
    });
    document.body.appendChild(host);
  }
  return host;
}

/** Failure and emptiness are moments for direction: every toast says what next. */
export function toast(
  tone: ToastTone,
  heading: string,
  detail = "",
  ms = 6000,
): void {
  const node = el(
    "div",
    { class: `toast ${tone}` },
    el("b", { text: heading }),
    detail ? el("span", { text: detail }) : null,
  );
  ensureHost().appendChild(node);
  setTimeout(() => node.remove(), ms);
}
