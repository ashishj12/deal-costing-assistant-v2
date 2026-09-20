import { el } from "../dom";
import { button } from "./primitives";

export interface DrawerOptions {
  readonly title: string;
  readonly body: HTMLElement;
  readonly footer?: readonly HTMLElement[];
  readonly onClose: () => void;
}

/** Focus is trapped and Escape closes, so keyboard review is not a dead end. */
export function drawer(options: DrawerOptions): HTMLElement {
  const scrim = el("div", { class: "drawer-scrim" });
  scrim.addEventListener("click", options.onClose);

  const closeButton = button("Close", {
    small: true,
    onClick: options.onClose,
  });
  const panel = el(
    "aside",
    {
      class: "drawer",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": options.title,
    },
    el("header", {}, el("h3", { text: options.title }), closeButton),
    el("div", { class: "body" }, options.body),
    options.footer && options.footer.length > 0
      ? el("footer", {}, ...options.footer)
      : null,
  );

  panel.addEventListener("keydown", (event) => {
    const keyboard = event as KeyboardEvent;
    if (keyboard.key === "Escape") {
      event.preventDefault();
      options.onClose();
      return;
    }
    if (keyboard.key !== "Tab") return;
    const focusable = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusable.length === 0) return;
    const first = focusable[0] as HTMLElement;
    const last = focusable[focusable.length - 1] as HTMLElement;
    if (keyboard.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!keyboard.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  const host = el("div", {}, scrim, panel);
  queueMicrotask(() => closeButton.focus());
  return host;
}
