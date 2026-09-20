/** Stable, prefixed, never-reused identifiers. */

export const ID_PATTERNS = {
  requirement: /^REQ-\d{3}$/,
  assumption: /^ASM-\d{3}$/,
  question: /^QST-\d{3}$/,
  risk: /^RSK-\d{3}$/,
  capability: /^CAP-\d{3}$/,
  scopeItem: /^SCP-\d{3}$/,
  component: /^CMP-\d{3}$/,
  integration: /^INT-\d{3}$/,
  dataDomain: /^DAT-\d{3}$/,
  aiUseCase: /^AIU-\d{3}$/,
  workstream: /^WS-\d{3}$/,
  source: /^SRC-\d{3}$/,
  artifact: /^ART-[a-z-]+-v\d+$/,
} as const;

export type IdKind = keyof typeof ID_PATTERNS;

const PREFIX: Record<Exclude<IdKind, "artifact">, string> = {
  requirement: "REQ",
  assumption: "ASM",
  question: "QST",
  risk: "RSK",
  capability: "CAP",
  scopeItem: "SCP",
  component: "CMP",
  integration: "INT",
  dataDomain: "DAT",
  aiUseCase: "AIU",
  workstream: "WS",
  source: "SRC",
};

export function isId(kind: IdKind, value: string): boolean {
  return ID_PATTERNS[kind].test(value);
}

export function nextId(
  kind: Exclude<IdKind, "artifact">,
  existing: readonly string[],
): string {
  const prefix = PREFIX[kind];
  let highest = 0;
  for (const id of existing) {
    if (!id.startsWith(`${prefix}-`)) continue;
    const n = Number.parseInt(id.slice(prefix.length + 1), 10);
    if (Number.isFinite(n) && n > highest) highest = n;
  }
  return `${prefix}-${String(highest + 1).padStart(3, "0")}`;
}

export function artifactId(kind: string, version: number): string {
  return `ART-${kind}-v${version}`;
}
