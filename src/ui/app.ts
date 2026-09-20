import { clear, el } from "./dom";
import { Store } from "./state";
import { chip } from "./components/primitives";
import { GATE_LABEL } from "../engines/quality-gate";
import { overviewView } from "./views/overview";
import { intakeView } from "./views/intake";
import { requirementsView } from "./views/requirements";
import { scopeView } from "./views/scope";
import { architectureView } from "./views/architecture";
import { solutionView } from "./views/solution";
import { estimationView } from "./views/estimation";
import { changesView } from "./views/changes";
import { deliverablesView } from "./views/deliverables";

interface Route {
  readonly hash: string;
  readonly label: string;
  readonly render: (store: Store, rerender: () => void) => HTMLElement;
}

const ROUTES: readonly Route[] = [
  { hash: "#/overview", label: "Overview", render: (s) => overviewView(s) },
  { hash: "#/intake", label: "Intake", render: intakeView },
  { hash: "#/requirements", label: "Requirements", render: requirementsView },
  { hash: "#/scope", label: "Scope & PRD", render: scopeView },
  { hash: "#/architecture", label: "Architecture", render: architectureView },
  { hash: "#/solution", label: "Solution design", render: solutionView },
  { hash: "#/estimation", label: "Estimation", render: estimationView },
  { hash: "#/changes", label: "Changes", render: changesView },
  {
    hash: "#/deliverables",
    label: "Quality & export",
    render: deliverablesView,
  },
];

/**
 * The shell. The context bar is persistent on purpose: which project, which
 * scope version, whether it is approved, what the gate says and which
 * provider produced the content are the five facts a reviewer needs at all
 * times, and losing them is how AI output gets mistaken for customer fact.
 */
export function mountApp(root: HTMLElement, store: Store): void {
  const render = (): void => {
    const hash = location.hash || "#/overview";
    const route = ROUTES.find((r) => r.hash === hash) ?? (ROUTES[0] as Route);

    clear(root);
    const app = el("div", { class: "app" });
    app.appendChild(contextBar(store));
    app.appendChild(navigation(store, route));

    const main = el("main", { class: "view", id: "main", tabindex: "-1" });
    try {
      main.appendChild(route.render(store, render));
    } catch (error) {
      main.appendChild(
        el(
          "div",
          { class: "alert stop" },
          el("h4", { text: "This screen failed to render" }),
          el("p", {
            text: error instanceof Error ? error.message : "Unknown error.",
          }),
          el("p", {
            class: "notice",
            text: "The workspace itself is intact. Move to another screen, or reset the workspace from the quality and export screen.",
          }),
        ),
      );
    }
    app.appendChild(main);
    root.appendChild(app);
  };

  window.addEventListener("hashchange", () => {
    store.state.route = location.hash;
    render();
  });
  store.subscribe(() => undefined);
  render();
}

function contextBar(store: Store): HTMLElement {
  const { model } = store.state;
  const quality = store.quality();
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

  const bar = el(
    "header",
    { class: "contextbar" },
    el(
      "div",
      { class: "project" },
      el("b", { text: model.projectName }),
      el("span", {
        text: model.customer.customerName || "No customer recorded",
      }),
    ),
    el(
      "div",
      { class: "ctx-item" },
      el("span", { class: "k", text: "Scope model" }),
      el("span", { class: "v", text: `v${model.version}` }),
    ),
    el(
      "div",
      { class: "ctx-item" },
      el("span", { class: "k", text: "Approval" }),
      el(
        "span",
        { class: "v" },
        model.approval.scopeApproved
          ? chip(
              "ok",
              "\u2713",
              `Approved at v${model.approval.approvedAtVersion}`,
            )
          : chip("warn", "\u25CB", "Not approved"),
      ),
    ),
    el(
      "div",
      { class: "ctx-item" },
      el("span", { class: "k", text: "Quality gate" }),
      el("span", { class: "v" }, chip(tone, glyph, GATE_LABEL[quality.status])),
    ),
    el(
      "div",
      { class: "ctx-item" },
      el("span", { class: "k", text: "AI provider" }),
      el(
        "span",
        { class: "v" },
        chip(
          "neutral",
          "\u25CF",
          store.providerName === "mock"
            ? "Mock (deterministic)"
            : "Gemini (live)",
          store.providerName === "mock"
            ? "No external calls are made. All proposals come from documented local heuristics."
            : "Live provider responses pass through the same schemas and deterministic engines.",
        ),
      ),
    ),
  );

  if (store.state.busy) {
    bar.appendChild(
      el(
        "div",
        { class: "ctx-item" },
        el("span", { class: "k", text: "Working" }),
        el("span", { class: "v", text: store.state.busy.label }),
      ),
    );
  }
  return bar;
}

function navigation(store: Store, current: Route): HTMLElement {
  const quality = store.quality();
  const nav = el("nav", {
    class: "primary",
    "aria-label": "Workspace sections",
  });

  const blockersByRoute = new Map<string, number>();
  const warningsByRoute = new Map<string, number>();
  for (const check of quality.checks) {
    if (check.severity === "blocking")
      blockersByRoute.set(
        check.route,
        (blockersByRoute.get(check.route) ?? 0) + 1,
      );
    if (check.severity === "warning")
      warningsByRoute.set(
        check.route,
        (warningsByRoute.get(check.route) ?? 0) + 1,
      );
  }

  for (const route of ROUTES) {
    const blocking = blockersByRoute.get(route.hash) ?? 0;
    const warning = warningsByRoute.get(route.hash) ?? 0;
    const link = el(
      "a",
      {
        href: route.hash,
        "aria-current": route.hash === current.hash ? "page" : "false",
        title:
          blocking > 0
            ? `${blocking} blocking issue(s)`
            : warning > 0
              ? `${warning} warning(s)`
              : "",
      },
      route.label,
    );
    if (blocking > 0) link.appendChild(el("span", { class: "dot stop" }));
    else if (warning > 0) link.appendChild(el("span", { class: "dot warn" }));
    nav.appendChild(link);
  }
  return nav;
}
