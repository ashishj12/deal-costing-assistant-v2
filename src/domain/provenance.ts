import { s } from "./schema";

export const PROVENANCE_VALUES = [
  "customer-stated",
  "ai-inferred",
  "user-assumption",
  "ai-recommendation",
  "out-of-scope",
] as const;

export type Provenance = (typeof PROVENANCE_VALUES)[number];
export const ProvenanceSchema = s.enum(PROVENANCE_VALUES);

export const REVIEW_STATUS_VALUES = [
  "draft",
  "in-review",
  "approved",
  "needs-changes",
  "rejected",
] as const;

export type ReviewStatus = (typeof REVIEW_STATUS_VALUES)[number];
export const ReviewStatusSchema = s.enum(REVIEW_STATUS_VALUES);

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  "customer-stated": "Customer",
  "ai-inferred": "Inferred",
  "user-assumption": "Assumption",
  "ai-recommendation": "Recommendation",
  "out-of-scope": "Excluded",
};

/** Glyphs exist so provenance is never communicated by colour alone. */
export const PROVENANCE_GLYPH: Record<Provenance, string> = {
  "customer-stated": "\u25A0",
  "ai-inferred": "\u25C6",
  "user-assumption": "\u25B2",
  "ai-recommendation": "\u25CF",
  "out-of-scope": "\u25CB",
};

export const PROVENANCE_DESCRIPTION: Record<Provenance, string> = {
  "customer-stated":
    "Stated in a source document with a citation that resolved against the original text.",
  "ai-inferred":
    "Derived by the assistant from customer material. Needs human confirmation before entering approved scope.",
  "user-assumption":
    "A gap filled deliberately by a reviewer. Carries into the package and the estimate as a stated dependency.",
  "ai-recommendation": "A proposal. Never presented as a customer constraint.",
  "out-of-scope":
    "Explicitly excluded, retained so exclusions survive into the exported package.",
};

/** Only a resolved customer citation may ever be described as confirmed. */
export function isCustomerConfirmed(
  provenance: Provenance,
  citationResolved: boolean,
): boolean {
  return provenance === "customer-stated" && citationResolved;
}

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  draft: "Draft",
  "in-review": "In review",
  approved: "Approved",
  "needs-changes": "Needs changes",
  rejected: "Rejected",
};
