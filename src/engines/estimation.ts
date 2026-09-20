import { ScopeModel } from "../domain/entities";
import { WorkstreamProposal } from "../domain/artifacts";
import {
  BASE_UNITS,
  BAND_UNCERTAINTY,
  COMPLIANCE_FACTOR,
  CONFIDENCE_WEIGHTS,
  CURRENCY_SYMBOL,
  Currency,
  DATA_COMPLEXITY_FACTOR,
  DEFAULT_RATES,
  INTEGRATION_FACTOR_CAP,
  INTEGRATION_FACTOR_PER_SYSTEM,
  RATE_CARD_VERSION,
  Role,
  ROLES,
} from "./rates";
import { computeCoverage, mandatoryCoverageRatio } from "./coverage";

export class EstimationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = "EstimationError";
  }
}

export type EstimationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { field: string; message: string } };

export interface FactorTrace {
  readonly label: string;
  readonly value: number;
  readonly explanation: string;
}

export interface WorkstreamEstimate {
  readonly workstreamId: string;
  readonly name: string;
  readonly band: WorkstreamProposal["band"];
  readonly bandRationale: string;
  readonly drivers: readonly string[];
  readonly requirementIds: readonly string[];
  readonly baseHours: number;
  readonly factors: readonly FactorTrace[];
  readonly adjustedHours: number;
  readonly lowHours: number;
  readonly highHours: number;
  readonly roleHours: Readonly<Record<string, number>>;
  readonly cost: number;
  readonly dependencies: readonly string[];
}

export interface EstimateTotals {
  readonly lowHours: number;
  readonly highHours: number;
  readonly midHours: number;
  readonly costLow: number;
  readonly costHigh: number;
  readonly romLow: number;
  readonly romHigh: number;
  readonly contingency: number;
  readonly currency: Currency;
  readonly rateCardVersion: string;
}

export interface ConfidenceBreakdown {
  readonly grounding: number;
  readonly questionResolution: number;
  readonly assumptionValidation: number;
  readonly coverage: number;
  readonly score: number;
  readonly label: "low" | "medium" | "high";
}

export interface TimelineResult {
  readonly criticalPathIds: readonly string[];
  readonly weeksLow: number;
  readonly weeksHigh: number;
  readonly capacityHoursPerWeek: number;
  readonly deadlineConflict: boolean;
}

export interface Estimate {
  readonly workstreams: readonly WorkstreamEstimate[];
  readonly totals: EstimateTotals;
  readonly confidence: ConfidenceBreakdown;
  readonly timeline: TimelineResult;
  readonly exclusions: readonly string[];
  readonly rates: Readonly<Record<string, number>>;
}

const round = (n: number, dp = 1): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

export function integrationFactor(externalSystemCount: number): number {
  const raw =
    1 + INTEGRATION_FACTOR_PER_SYSTEM * Math.max(0, externalSystemCount);
  return Math.min(raw, INTEGRATION_FACTOR_CAP);
}

/**
 * Deterministic. Given the same model and workstreams, this returns exactly
 * the same numbers, every time, on every machine. No model output reaches it
 * except the complexity band, which is a bounded enum.
 */
export function computeEstimate(
  model: ScopeModel,
  workstreams: readonly WorkstreamProposal[],
  rateOverrides: Partial<Record<Role, number>> = {},
): EstimationResult<Estimate> {
  const config = model.configuration;

  if (workstreams.length === 0) {
    return {
      ok: false,
      error: {
        field: "workstreams",
        message:
          "There are no estimable workstreams. Generate the functional scope first.",
      },
    };
  }
  if (!(config.productivityFactor > 0)) {
    return {
      ok: false,
      error: {
        field: "productivityFactor",
        message: "Productivity factor must be greater than zero.",
      },
    };
  }
  if (config.contingency < 0) {
    return {
      ok: false,
      error: {
        field: "contingency",
        message: "Contingency cannot be negative.",
      },
    };
  }

  const currency = config.currency as Currency;
  const baseRates = DEFAULT_RATES[currency];
  if (!baseRates) {
    return {
      ok: false,
      error: {
        field: "currency",
        message: `No rate card is defined for ${config.currency}.`,
      },
    };
  }

  const rates: Record<string, number> = {};
  for (const role of ROLES) {
    const rate = rateOverrides[role] ?? baseRates[role];
    if (!Number.isFinite(rate) || rate < 0) {
      return {
        ok: false,
        error: {
          field: `rate.${role}`,
          message: `Rate for ${role} must be a non-negative number.`,
        },
      };
    }
    rates[role] = rate;
  }

  const intFactor = integrationFactor(config.externalSystemCount);
  const secFactor = COMPLIANCE_FACTOR[config.complianceTier];
  const dataFactor = DATA_COMPLEXITY_FACTOR[config.dataComplexity];

  const estimates: WorkstreamEstimate[] = [];

  for (const ws of workstreams) {
    const mixTotal = Object.values(ws.roleMix).reduce((a, b) => a + b, 0);
    if (Math.abs(mixTotal - 1) > 0.001) {
      return {
        ok: false,
        error: {
          field: `${ws.id}.roleMix`,
          message: `Role mix for ${ws.id} sums to ${round(mixTotal, 3)}; it must sum to 1.`,
        },
      };
    }
    for (const [role, share] of Object.entries(ws.roleMix)) {
      if (!(role in rates)) {
        return {
          ok: false,
          error: {
            field: `${ws.id}.roleMix.${role}`,
            message: `Unknown role "${role}" in ${ws.id}.`,
          },
        };
      }
      if (share < 0) {
        return {
          ok: false,
          error: {
            field: `${ws.id}.roleMix.${role}`,
            message: `Role share cannot be negative.`,
          },
        };
      }
    }

    const baseHours = BASE_UNITS[ws.band];
    const adjustedHours =
      (baseHours * intFactor * secFactor * dataFactor) /
      config.productivityFactor;
    const spread = BAND_UNCERTAINTY[ws.band];
    const lowHours = adjustedHours * (1 - spread);
    const highHours = adjustedHours * (1 + spread);

    const roleHours: Record<string, number> = {};
    let cost = 0;
    for (const [role, share] of Object.entries(ws.roleMix)) {
      const hours = adjustedHours * share;
      roleHours[role] = round(hours);
      cost += hours * (rates[role] as number);
    }

    estimates.push({
      workstreamId: ws.id,
      name: ws.name,
      band: ws.band,
      bandRationale: ws.bandRationale,
      drivers: ws.drivers,
      requirementIds: ws.requirementIds,
      baseHours,
      factors: [
        {
          label: "Integration",
          value: round(intFactor, 2),
          explanation: `${config.externalSystemCount} external system(s) at ${INTEGRATION_FACTOR_PER_SYSTEM * 100}% each, capped at ${INTEGRATION_FACTOR_CAP}x.`,
        },
        {
          label: "Security",
          value: secFactor,
          explanation: `Compliance tier: ${config.complianceTier}.`,
        },
        {
          label: "Data complexity",
          value: dataFactor,
          explanation: `Data complexity: ${config.dataComplexity}.`,
        },
        {
          label: "Productivity",
          value: config.productivityFactor,
          explanation: "Divisor. Team maturity and delivery environment.",
        },
      ],
      adjustedHours: round(adjustedHours),
      lowHours: round(lowHours),
      highHours: round(highHours),
      roleHours,
      cost: Math.round(cost),
      dependencies: ws.dependencies,
    });
  }

  const lowHours = round(estimates.reduce((a, w) => a + w.lowHours, 0));
  const highHours = round(estimates.reduce((a, w) => a + w.highHours, 0));
  const midHours = round(estimates.reduce((a, w) => a + w.adjustedHours, 0));
  const midCost = estimates.reduce((a, w) => a + w.cost, 0);
  const costLow = Math.round(midCost * (lowHours / (midHours || 1)));
  const costHigh = Math.round(midCost * (highHours / (midHours || 1)));

  const totals: EstimateTotals = {
    lowHours,
    highHours,
    midHours,
    costLow,
    costHigh,
    romLow: Math.round(costLow * (1 + config.contingency)),
    romHigh: Math.round(costHigh * (1 + config.contingency)),
    contingency: config.contingency,
    currency,
    rateCardVersion: RATE_CARD_VERSION,
  };

  const timeline = computeTimeline(
    estimates,
    config.teamCapacity,
    config.targetDeadlineWeeks,
  );
  if (!timeline.ok) return { ok: false, error: timeline.error };

  return {
    ok: true,
    value: {
      workstreams: estimates,
      totals,
      confidence: computeConfidence(model),
      timeline: timeline.value,
      exclusions: [
        "Third-party licence and cloud consumption costs.",
        "Data migration from systems not listed in the integration inventory.",
        "End-user training beyond train-the-trainer.",
        "Production hypercare beyond two weeks.",
      ],
      rates,
    },
  };
}

export function computeTimeline(
  workstreams: readonly WorkstreamEstimate[],
  teamCapacity: number,
  targetDeadlineWeeks: number | null,
): EstimationResult<TimelineResult> {
  if (!Number.isInteger(teamCapacity) || teamCapacity < 1) {
    return {
      ok: false,
      error: {
        field: "teamCapacity",
        message: "Team capacity must be at least one person.",
      },
    };
  }

  const byId = new Map(workstreams.map((w) => [w.workstreamId, w]));
  const memoLow = new Map<string, number>();
  const memoHigh = new Map<string, number>();
  const predecessor = new Map<string, string | null>();
  const visiting = new Set<string>();

  const walk = (
    id: string,
    memo: Map<string, number>,
    pick: (w: WorkstreamEstimate) => number,
  ): number | null => {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return null;
    const ws = byId.get(id);
    if (!ws) return 0;
    visiting.add(id);
    let best = 0;
    let bestFrom: string | null = null;
    for (const dep of ws.dependencies) {
      const value = walk(dep, memo, pick);
      if (value === null) return null;
      if (value > best) {
        best = value;
        bestFrom = dep;
      }
    }
    visiting.delete(id);
    const total = best + pick(ws);
    memo.set(id, total);
    if (memo === memoHigh) predecessor.set(id, bestFrom);
    return total;
  };

  let pathLow = 0;
  let pathHigh = 0;
  let terminal: string | null = null;
  for (const ws of workstreams) {
    const lo = walk(ws.workstreamId, memoLow, (w) => w.lowHours);
    const hi = walk(ws.workstreamId, memoHigh, (w) => w.highHours);
    if (lo === null || hi === null) {
      return {
        ok: false,
        error: {
          field: "dependencies",
          message: `Workstream dependencies contain a cycle involving ${ws.workstreamId}.`,
        },
      };
    }
    if (lo > pathLow) pathLow = lo;
    if (hi > pathHigh) {
      pathHigh = hi;
      terminal = ws.workstreamId;
    }
  }

  const criticalPathIds: string[] = [];
  let cursor = terminal;
  while (cursor) {
    criticalPathIds.unshift(cursor);
    cursor = predecessor.get(cursor) ?? null;
  }

  // One person can contribute at most ~32 productive hours a week to a single
  // chain; parallel capacity compresses only the non-critical work.
  const hoursPerPersonWeek = 32;
  const capacityHoursPerWeek = teamCapacity * hoursPerPersonWeek;
  const totalLow = workstreams.reduce((a, w) => a + w.lowHours, 0);
  const totalHigh = workstreams.reduce((a, w) => a + w.highHours, 0);

  const weeksLow = Math.max(
    Math.ceil(pathLow / hoursPerPersonWeek),
    Math.ceil(totalLow / capacityHoursPerWeek),
  );
  const weeksHigh = Math.max(
    Math.ceil(pathHigh / hoursPerPersonWeek),
    Math.ceil(totalHigh / capacityHoursPerWeek),
  );

  return {
    ok: true,
    value: {
      criticalPathIds,
      weeksLow,
      weeksHigh,
      capacityHoursPerWeek,
      deadlineConflict:
        targetDeadlineWeeks !== null && weeksHigh > targetDeadlineWeeks,
    },
  };
}

/** Four measurable ratios, each surfaced beside the result. Never a slider. */
export function computeConfidence(model: ScopeModel): ConfidenceBreakdown {
  const live = model.requirements.filter(
    (r) => r.status !== "rejected" && r.provenance !== "out-of-scope",
  );
  const grounding =
    live.length === 0
      ? 0
      : live.filter(
          (r) => r.provenance === "customer-stated" && r.citationResolved,
        ).length / live.length;

  const blocking = model.questions.filter((q) => q.blocking);
  const questionResolution =
    blocking.length === 0
      ? 1
      : blocking.filter((q) => q.resolved).length / blocking.length;

  const relevantAssumptions = model.assumptions.filter(
    (a) => a.needsValidation,
  );
  const assumptionValidation =
    relevantAssumptions.length === 0
      ? 1
      : relevantAssumptions.filter((a) => a.status === "approved").length /
        relevantAssumptions.length;

  const coverage = mandatoryCoverageRatio(model);

  const score =
    grounding * CONFIDENCE_WEIGHTS.grounding +
    questionResolution * CONFIDENCE_WEIGHTS.questionResolution +
    assumptionValidation * CONFIDENCE_WEIGHTS.assumptionValidation +
    coverage * CONFIDENCE_WEIGHTS.coverage;

  return {
    grounding: round(grounding, 3),
    questionResolution: round(questionResolution, 3),
    assumptionValidation: round(assumptionValidation, 3),
    coverage: round(coverage, 3),
    score: round(score, 3),
    label: score >= 0.75 ? "high" : score >= 0.5 ? "medium" : "low",
  };
}

export function formatCurrency(amount: number, currency: Currency): string {
  const symbol = CURRENCY_SYMBOL[currency];
  return `${symbol}${Math.round(amount).toLocaleString("en-US")}`;
}

export function coverageSnapshot(model: ScopeModel) {
  return computeCoverage(model);
}
