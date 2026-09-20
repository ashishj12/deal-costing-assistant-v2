import { svgEl, el } from "../dom";
import {
  ArchitectureArtifact,
  ArchitectureComponent,
} from "../../domain/artifacts";

const LAYER_ORDER = [
  "edge",
  "security",
  "application",
  "integration",
  "data",
  "ai",
  "observability",
] as const;

const LAYER_LABEL: Record<string, string> = {
  edge: "Edge",
  security: "Security",
  application: "Application",
  integration: "Integration",
  data: "Data",
  ai: "AI",
  observability: "Observability",
};

const NODE_W = 168;
const NODE_H = 54;
const COL_GAP = 68;
const ROW_GAP = 18;
const PAD = 28;
const LANE_LABEL_H = 18;

export function architectureDiagram(
  artifact: ArchitectureArtifact,
  selectedId: string | null,
  onSelect: (component: ArchitectureComponent) => void,
): HTMLElement {
  const wrap = el("div", { class: "diagram" });

  const lanes = LAYER_ORDER.map((layer) => ({
    layer,
    components: artifact.components.filter((c) => c.layer === layer),
  })).filter((lane) => lane.components.length > 0);

  if (lanes.length === 0) {
    wrap.appendChild(
      el(
        "div",
        { class: "empty" },
        el("h3", { text: "Nothing to draw" }),
        el("p", {
          text: "The architecture contains no components, so no diagram can be rendered.",
        }),
      ),
    );
    return wrap;
  }

  const tallest = Math.max(...lanes.map((l) => l.components.length));
  const width = PAD * 2 + lanes.length * NODE_W + (lanes.length - 1) * COL_GAP;
  const height =
    PAD * 2 + LANE_LABEL_H + tallest * NODE_H + (tallest - 1) * ROW_GAP;

  const position = new Map<string, { x: number; y: number }>();
  lanes.forEach((lane, columnIndex) => {
    const x = PAD + columnIndex * (NODE_W + COL_GAP);
    lane.components.forEach((component, rowIndex) => {
      position.set(component.id, {
        x,
        y: PAD + LANE_LABEL_H + rowIndex * (NODE_H + ROW_GAP),
      });
    });
  });

  const svg = svgEl("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width: String(width),
    height: String(height),
    role: "img",
    "aria-label": `Architecture diagram with ${artifact.components.length} components`,
  });

  const defs = svgEl(
    "defs",
    {},
    svgEl(
      "marker",
      {
        id: "arrow",
        viewBox: "0 0 8 8",
        refX: "7",
        refY: "4",
        markerWidth: "7",
        markerHeight: "7",
        orient: "auto-start-reverse",
      },
      svgEl("path", { d: "M0,0 L8,4 L0,8 z", fill: "currentColor" }),
    ),
  );
  svg.appendChild(defs);

  // Lane guides carry information (which layer a component sits in), not decoration.
  lanes.forEach((lane, columnIndex) => {
    const x = PAD + columnIndex * (NODE_W + COL_GAP);
    const group = svgEl("g", { class: "lane" });
    group.appendChild(
      svgEl("rect", {
        x: String(x - 10),
        y: String(PAD - 4),
        width: String(NODE_W + 20),
        height: String(height - PAD * 2 + 8),
        rx: "4",
      }),
    );
    group.appendChild(
      svgEl(
        "text",
        { x: String(x), y: String(PAD + 8) },
        LAYER_LABEL[lane.layer] ?? lane.layer,
      ),
    );
    svg.appendChild(group);
  });

  const edgeGroup = svgEl("g", { class: "edges", color: "currentColor" });
  for (const edge of artifact.edges) {
    const from = position.get(edge.from);
    const to = position.get(edge.to);
    if (!from || !to) continue;
    const x1 = from.x + NODE_W;
    const y1 = from.y + NODE_H / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_H / 2;
    const mid = (x1 + x2) / 2;
    const path = svgEl("path", {
      class: `edge ${edge.kind}`,
      d:
        x2 >= x1
          ? `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`
          : `M${x1},${y1} C${x1 + 40},${y1 - 34} ${x2 - 40},${y2 - 34} ${x2},${y2}`,
      "marker-end": "url(#arrow)",
      "stroke-width": "1.2",
    });
    path.appendChild(
      svgEl(
        "title",
        {},
        `${edge.from} \u2192 ${edge.to}${edge.label ? `: ${edge.label}` : ""}`,
      ),
    );
    edgeGroup.appendChild(path);
  }
  svg.appendChild(edgeGroup);

  for (const component of artifact.components) {
    const pos = position.get(component.id);
    if (!pos) continue;
    const group = svgEl("g", {
      class: `node${selectedId === component.id ? " selected" : ""}`,
      tabindex: "0",
      role: "button",
      "aria-label": `${component.name}, ${component.layer} layer`,
    });
    group.appendChild(
      svgEl("rect", {
        x: String(pos.x),
        y: String(pos.y),
        width: String(NODE_W),
        height: String(NODE_H),
        rx: "3",
      }),
    );
    group.appendChild(
      svgEl(
        "text",
        { x: String(pos.x + 10), y: String(pos.y + 20) },
        truncate(component.name, 24),
      ),
    );
    group.appendChild(
      svgEl(
        "text",
        { class: "svc", x: String(pos.x + 10), y: String(pos.y + 36) },
        component.id,
      ),
    );
    group.appendChild(
      svgEl(
        "text",
        { class: "svc", x: String(pos.x + 10), y: String(pos.y + 48) },
        component.requirementIds.length > 0
          ? `${component.requirementIds.length} linked requirement(s)`
          : "No linked requirement",
      ),
    );
    group.appendChild(
      svgEl("title", {}, `${component.name}\n${component.purpose}`),
    );
    group.addEventListener("click", () => onSelect(component));
    group.addEventListener("keydown", (event) => {
      const key = (event as KeyboardEvent).key;
      if (key === "Enter" || key === " ") {
        event.preventDefault();
        onSelect(component);
      }
    });
    svg.appendChild(group);
  }

  wrap.appendChild(svg);
  return wrap;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}\u2026` : value;
}
