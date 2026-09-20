import { ComplexityBand } from "../domain/artifacts";

export const RATE_CARD_VERSION = "2026.1";

export const BASE_UNITS: Record<ComplexityBand, number> = {
  S: 40,
  M: 120,
  L: 320,
  XL: 720,
};

/** Symmetric uncertainty applied to each band to produce the range. */
export const BAND_UNCERTAINTY: Record<ComplexityBand, number> = {
  S: 0.2,
  M: 0.25,
  L: 0.35,
  XL: 0.45,
};

export const ROLES = [
  "solution-architect",
  "tech-lead",
  "engineer",
  "data-engineer",
  "qa",
  "project-manager",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  "solution-architect": "Solution architect",
  "tech-lead": "Tech lead",
  engineer: "Engineer",
  "data-engineer": "Data engineer",
  qa: "QA",
  "project-manager": "Project manager",
};

export type Currency = "USD" | "EUR" | "GBP" | "INR" | "AUD";

/** Blended day rates converted to hourly. Editable in the estimation screen. */
export const DEFAULT_RATES: Record<Currency, Record<Role, number>> = {
  USD: {
    "solution-architect": 185,
    "tech-lead": 160,
    engineer: 125,
    "data-engineer": 135,
    qa: 95,
    "project-manager": 130,
  },
  EUR: {
    "solution-architect": 170,
    "tech-lead": 148,
    engineer: 115,
    "data-engineer": 124,
    qa: 88,
    "project-manager": 120,
  },
  GBP: {
    "solution-architect": 150,
    "tech-lead": 130,
    engineer: 101,
    "data-engineer": 109,
    qa: 77,
    "project-manager": 105,
  },
  INR: {
    "solution-architect": 6200,
    "tech-lead": 5100,
    engineer: 3400,
    "data-engineer": 3800,
    qa: 2400,
    "project-manager": 3600,
  },
  AUD: {
    "solution-architect": 275,
    "tech-lead": 238,
    engineer: 186,
    "data-engineer": 201,
    qa: 141,
    "project-manager": 193,
  },
};

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  USD: "$",
  EUR: "\u20AC",
  GBP: "\u00A3",
  INR: "\u20B9",
  AUD: "A$",
};

export const COMPLIANCE_FACTOR = {
  standard: 1.0,
  regulated: 1.15,
  critical: 1.35,
} as const;
export const DATA_COMPLEXITY_FACTOR = {
  low: 1.0,
  medium: 1.2,
  high: 1.45,
} as const;
export const INTEGRATION_FACTOR_PER_SYSTEM = 0.08;
export const INTEGRATION_FACTOR_CAP = 2.0;

export const CONCURRENCY_TIER_USERS = {
  pilot: 500,
  departmental: 5_000,
  enterprise: 100_000,
  "internet-scale": 1_000_000,
} as const;

export function concurrencyTierForUsers(
  users: number,
): keyof typeof CONCURRENCY_TIER_USERS {
  if (users <= CONCURRENCY_TIER_USERS.pilot) return "pilot";
  if (users <= CONCURRENCY_TIER_USERS.departmental) return "departmental";
  if (users <= CONCURRENCY_TIER_USERS.enterprise) return "enterprise";
  return "internet-scale";
}

export const CONFIDENCE_WEIGHTS = {
  grounding: 0.35,
  questionResolution: 0.25,
  assumptionValidation: 0.2,
  coverage: 0.2,
} as const;
