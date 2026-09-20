import { ScopeModel } from "../domain/entities";
import {
  AiStrategyArtifact,
  ArchitectureArtifact,
  DataStrategyArtifact,
  FunctionalScopeArtifact,
  IntegrationArtifact,
  PrdArtifact,
} from "../domain/artifacts";
import { Estimate } from "../engines/estimation";
import { CoverageReport } from "../engines/coverage";
import { QualityReport } from "../engines/quality-gate";
import { ImpactAnalysis } from "../engines/impact";

export const PACKAGE_DISCLAIMER =
  "This document is an AI-assisted internal planning output based on customer requirements and stated assumptions. " +
  "It requires review and validation by qualified sales, architecture, delivery, security, and commercial stakeholders. " +
  "It is not a final quote, contractual commitment, or delivery guarantee.";

export interface PackageModel {
  readonly generatedAt: string;
  readonly model: ScopeModel;
  readonly prd: PrdArtifact | null;
  readonly functionalScope: FunctionalScopeArtifact | null;
  readonly architecture: ArchitectureArtifact | null;
  readonly dataStrategy: DataStrategyArtifact | null;
  readonly integrations: IntegrationArtifact | null;
  readonly aiStrategy: AiStrategyArtifact | null;
  readonly estimate: Estimate | null;
  readonly coverage: CoverageReport;
  readonly quality: QualityReport;
  readonly lastImpact: ImpactAnalysis | null;
  readonly disclaimer: string;
}

export interface PackageSectionStatus {
  readonly key: string;
  readonly title: string;
  readonly present: boolean;
  readonly note: string;
}

/** Readiness is reported per section; missing sections are never faked. */
export function packageSections(pkg: PackageModel): PackageSectionStatus[] {
  return [
    {
      key: "summary",
      title: "Executive summary",
      present: pkg.prd !== null,
      note: pkg.prd ? "" : "Generate the PRD to populate this section.",
    },
    {
      key: "objectives",
      title: "Customer objectives",
      present: pkg.model.customer.businessObjectives.length > 0,
      note:
        pkg.model.customer.businessObjectives.length > 0
          ? ""
          : "No objectives were captured at intake.",
    },
    {
      key: "requirements",
      title: "Requirement summary",
      present: pkg.model.requirements.length > 0,
      note:
        pkg.model.requirements.length > 0 ? "" : "No requirements captured.",
    },
    {
      key: "prd",
      title: "Product requirements document",
      present: pkg.prd !== null,
      note: pkg.prd ? "" : "Not generated.",
    },
    {
      key: "scope",
      title: "Functional scope",
      present: pkg.functionalScope !== null,
      note: pkg.functionalScope ? "" : "Not generated.",
    },
    {
      key: "architecture",
      title: "Solution architecture",
      present: pkg.architecture !== null,
      note: pkg.architecture ? "" : "Not generated.",
    },
    {
      key: "data",
      title: "Data strategy",
      present: pkg.dataStrategy !== null,
      note: pkg.dataStrategy ? "" : "Not generated.",
    },
    {
      key: "integration",
      title: "Integration architecture",
      present: pkg.integrations !== null,
      note: pkg.integrations ? "" : "Not generated.",
    },
    {
      key: "ai",
      title: "AI strategy",
      present: pkg.aiStrategy !== null,
      note: pkg.aiStrategy ? "" : "Not generated.",
    },
    {
      key: "estimate",
      title: "Effort, timeline and ROM",
      present: pkg.estimate !== null,
      note: pkg.estimate ? "" : "Not generated.",
    },
    {
      key: "assumptions",
      title: "Assumptions",
      present: pkg.model.assumptions.length > 0,
      note: pkg.model.assumptions.length > 0 ? "" : "No assumptions recorded.",
    },
    {
      key: "risks",
      title: "Risks",
      present: pkg.model.risks.length > 0,
      note: pkg.model.risks.length > 0 ? "" : "No risks recorded.",
    },
    { key: "questions", title: "Open questions", present: true, note: "" },
    {
      key: "coverage",
      title: "Requirement coverage",
      present: pkg.coverage.inScopeTotal > 0,
      note: "",
    },
    {
      key: "traceability",
      title: "Traceability matrix",
      present: pkg.model.scopeItems.length > 0,
      note: pkg.model.scopeItems.length > 0 ? "" : "No scope items to trace.",
    },
    {
      key: "impact",
      title: "Change impact summary",
      present: pkg.lastImpact !== null,
      note: pkg.lastImpact ? "" : "No change has been analysed yet.",
    },
    { key: "quality", title: "Quality status", present: true, note: "" },
  ];
}
