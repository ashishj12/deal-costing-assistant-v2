import { SourceDocument, SourceSpan } from "../domain/entities";

export interface CitationResolution {
  readonly resolved: boolean;
  readonly span: SourceSpan | null;
  readonly reason: string;
}

function normalise(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

export function resolveCitation(
  sources: readonly SourceDocument[],
  sourceId: string | null,
  quote: string | null,
): CitationResolution {
  if (!sourceId || !quote || quote.trim().length === 0) {
    return {
      resolved: false,
      span: null,
      reason: "No source or quotation was supplied.",
    };
  }
  const source = sources.find((s) => s.id === sourceId);
  if (!source) {
    return {
      resolved: false,
      span: null,
      reason: `Source ${sourceId} is not present in the scope model.`,
    };
  }

  const exact = source.content.indexOf(quote);
  if (exact >= 0) {
    return {
      resolved: true,
      span: { sourceId, start: exact, end: exact + quote.length, quote },
      reason: "Quotation matched the source text exactly.",
    };
  }

  // Whitespace-insensitive fallback, mapped back to real offsets.
  const haystack = normalise(source.content);
  const needle = normalise(quote);
  const loose = haystack.indexOf(needle);
  if (loose < 0) {
    return {
      resolved: false,
      span: null,
      reason:
        "Quotation does not appear in the cited source. Requirement downgraded to inferred.",
    };
  }

  let plainIndex = 0;
  let realIndex = 0;
  let start = -1;
  while (realIndex < source.content.length && plainIndex <= loose) {
    const ch = source.content[realIndex] as string;
    if (/\s/.test(ch)) {
      const prev = source.content[realIndex - 1];
      if (prev !== undefined && !/\s/.test(prev)) plainIndex += 1;
    } else {
      if (plainIndex === loose && start < 0) start = realIndex;
      plainIndex += 1;
    }
    realIndex += 1;
  }
  if (start < 0) start = 0;
  const end = Math.min(source.content.length, start + quote.length);

  return {
    resolved: true,
    span: { sourceId, start, end, quote: source.content.slice(start, end) },
    reason:
      "Quotation matched the source text ignoring whitespace differences.",
  };
}
