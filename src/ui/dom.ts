type Child = Node | string | number | null | undefined | false;

export interface Attrs {
  readonly [key: string]: unknown;
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  applyAttrs(node, attrs);
  append(node, children);
  return node;
}

export function svgEl(
  tag: string,
  attrs: Attrs = {},
  ...children: Child[]
): SVGElement {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(key, String(value));
  }
  append(node, children);
  return node;
}

function applyAttrs(node: HTMLElement, attrs: Attrs): void {
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") {
      node.className = String(value);
      continue;
    }
    if (key === "text") {
      node.textContent = String(value);
      continue;
    }
    if (key === "html") {
      continue;
    } // never inject raw HTML
    if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      continue;
    }
    if (key === "value" && node instanceof HTMLInputElement) {
      node.value = String(value);
      continue;
    }
    if (key === "checked" && node instanceof HTMLInputElement) {
      node.checked = Boolean(value);
      continue;
    }
    if (key === "disabled") {
      (node as HTMLButtonElement).disabled = Boolean(value);
      continue;
    }
    node.setAttribute(key, value === true ? "" : String(value));
  }
}

function append(node: Node, children: Child[]): void {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(
      typeof child === "string" || typeof child === "number"
        ? document.createTextNode(String(child))
        : child,
    );
  }
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function fragment(...children: Child[]): DocumentFragment {
  const frag = document.createDocumentFragment();
  append(frag, children);
  return frag;
}

/** Escapes nothing and inserts nothing as HTML: text only, always. */
export function text(value: string): Text {
  return document.createTextNode(value);
}
