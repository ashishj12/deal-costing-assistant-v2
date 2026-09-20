import { ScopeModel, SourceDocument } from "../domain/entities";
import { createEmptyModel, makeSource, seedModel } from "./seed";

export type ScenarioId =
  | "northwind-modernisation"
  | "helix-integration"
  | "meridian-ai"
  | "brightwave-missing-info";

export interface ScenarioInfo {
  readonly id: ScenarioId;
  readonly title: string;
  readonly shape: string;
  readonly summary: string;
}

const HELIX_RFP = `Helix Retail - Order Data Integration Hub
Requirements extract, version 2

1.1 The platform must ingest online orders from our Shopify storefronts every minute through the Shopify Admin API and publish them to the warehouse management system.

1.2 The solution must integrate with our SAP S/4HANA finance system to post invoices and receive product master data. Master data changes must be synchronised within 15 minutes.

1.3 Three third-party logistics providers deliver stock files by SFTP each night. The system shall validate, transform and load these files, and must report every rejected record back to the provider.

1.4 All customer and order data must be loaded into a central analytics warehouse. The data model must support daily, weekly and monthly sales reporting by region and channel.

1.5 The platform must apply data quality rules to every inbound record, including duplicate detection, mandatory field checks and reference-data validation, and must quarantine failing records.

1.6 The solution shall keep a data lineage record showing the origin and transformations of every reporting figure.

1.7 Integration failures must be retried automatically and must raise an alert to the support team when retries are exhausted. Throughput must reach 120 orders per second during the November sales peak.

1.8 Personal data of EU customers must remain in EU regions and must be retained for no longer than 36 months, in line with GDPR.

1.9 The support team needs an operations console showing integration health, queue depth and rejected records.

1.10 The company would like a historical migration of five years of order history from the legacy database. The volume is not yet known.

1.11 Out of scope: replacement of the Shopify storefront and any change to the SAP configuration.`;

const HELIX_NOTES = `Workshop notes - integration landscape
Attendees: Head of Data, ERP Lead, Integration Architect

The legacy order database runs on an ageing Oracle instance owned by IT operations. The ERP Lead confirmed the SAP interface will be exposed through OData services, but the service catalogue is not yet published.

The Head of Data wants a single order customer key across Shopify and SAP. There is currently no agreed customer identifier, which must be resolved before mapping starts.

AWS is the preferred cloud because the analytics team already operates Amazon Redshift. Two of the logistics providers can only send flat files; the third has a REST API.

The programme wants to go live before the November peak, but the date is not contractual.`;

const MERIDIAN_BRIEF = `Meridian Insurance - Claims Assistant
Business requirements brief

2.1 Claims handlers must be able to ask natural-language questions about policy wording, endorsements and past claim decisions and receive answers that cite the exact source document.

2.2 The system must classify each incoming claim by type and urgency, and route it to the correct handling queue. Classification results must be reviewable by a handler before they take effect.

2.3 The solution must extract key fields (policy number, date of loss, claimed amount, damaged items) from claim forms and attached documents and pre-populate the claims system.

2.4 The solution must never approve, reject or settle a claim automatically. Every claim decision must be made and recorded by a named human handler.

2.5 The assistant must not expose personal data of one policyholder to a handler who has no right to that claim. Access control must follow existing claim permissions.

2.6 All personal data must be processed inside the EU and must not be used to train any external model. The company shall be able to demonstrate GDPR compliance to its regulator.

2.7 The team requires an evaluation approach that measures answer accuracy, citation correctness and hallucination rate before go-live and continuously afterwards.

2.8 The system must integrate with the Guidewire ClaimCenter platform through its REST APIs and with the corporate identity provider for single sign-on.

2.9 Handlers shall be able to give thumbs-up or thumbs-down feedback on each answer. Feedback must be stored and reviewed monthly.

2.10 Response time for a question must be under eight seconds for 95 percent of requests. The service must be available 99.5 percent during business hours.

2.11 Nice to have: a fraud-indicator score on each claim. This is desirable but the business has not decided whether it is acceptable to use automated scoring.

2.12 Out of scope: customer-facing chatbot access and any replacement of Guidewire ClaimCenter.`;

const MERIDIAN_NOTES = `Steering meeting notes
The Chief Claims Officer stated that Google Cloud is the approved platform because Vertex AI is already covered by the group data-protection assessment.

About 350 claims handlers will use the assistant, with roughly 40 concurrent at peak. The policy archive holds about 2 million pages of PDF and Word documents in a document management system. Access to that system has not yet been agreed.

The legal team is worried about hallucinated policy wording. They asked that answers without a supporting source are shown as "no answer found".`;

const BRIGHTWAVE_NOTES = `Brightwave Education - Learner Engagement Platform
Notes from the first call with the founder

We want a modern platform where learners can study, track progress and get help. It should be easy to use and fast. We would like to use AI in some way to make it more personal.

The platform must work for schools and for individual learners. We may need to connect to some school systems. Teachers should be able to see how their classes are doing.

We are thinking about mobile as well. Security is important because children may use it. We would like it delivered soon.

Payments should be supported if we decide to charge individuals. The budget is still being discussed internally.`;

const BRIGHTWAVE_EMAIL = `Follow-up email from the founder

The platform must support single sign-on for schools. Teachers shall be able to create classes and assign content to learners.

Learners must be able to see their own progress. The system should recommend next lessons using AI where suitable.

We have not chosen a cloud provider and have no technical team, so please recommend what suits us.`;

interface Scenario extends ScenarioInfo {
  readonly build: () => ScopeModel;
}

function scenarioModel(
  projectName: string,
  customer: ScopeModel["customer"],
  configuration: Partial<ScopeModel["configuration"]>,
  sources: readonly SourceDocument[],
): ScopeModel {
  const base = createEmptyModel();
  return {
    ...base,
    projectName,
    customer,
    configuration: { ...base.configuration, ...configuration },
    sources: [...sources],
  };
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "northwind-modernisation",
    title: "Northwind Logistics - carrier portal",
    shape: "Application modernisation",
    summary:
      "RFP, discovery notes and security questionnaire with contradictions, an explicit exclusion and a planted prompt injection. Azure.",
    build: () => seedModel(),
  },
  {
    id: "helix-integration",
    title: "Helix Retail - order data integration hub",
    shape: "Data / integration heavy",
    summary:
      "Shopify, SAP, three SFTP/REST logistics feeds, analytics warehouse, GDPR retention and a legacy migration of unknown volume. AWS.",
    build: () =>
      scenarioModel(
        "Helix Order Integration Hub",
        {
          customerName: "Helix Retail",
          opportunityName: "Order Data Integration Hub",
          industry: "Retail and e-commerce",
          businessObjectives: [
            "Give operations one reliable, near real-time order flow across storefront, ERP and warehouse",
            "Provide trusted daily sales reporting with full data lineage",
            "Sustain 120 orders per second during the November peak",
          ],
          opportunityStatus: "scoping",
        },
        {
          cloud: "aws",
          expectedUsers: 250,
          concurrencyTier: "enterprise",
          complianceTier: "regulated",
          externalSystemCount: 6,
          dataComplexity: "high",
          currency: "GBP",
          teamCapacity: 8,
          targetDeadlineWeeks: 28,
        },
        [
          makeSource(
            "SRC-001",
            "Helix RFP requirements v2.txt",
            "txt",
            HELIX_RFP,
          ),
          makeSource(
            "SRC-002",
            "Integration workshop notes.md",
            "md",
            HELIX_NOTES,
          ),
        ],
      ),
  },
  {
    id: "meridian-ai",
    title: "Meridian Insurance - claims assistant",
    shape: "AI-enabled solution",
    summary:
      "RAG over policy documents, claim classification and extraction, mandatory human decisions, GDPR and evaluation needs. Google Cloud.",
    build: () =>
      scenarioModel(
        "Meridian Claims Assistant",
        {
          customerName: "Meridian Insurance",
          opportunityName: "Claims Assistant",
          industry: "Insurance",
          businessObjectives: [
            "Reduce handler time spent searching policy wording",
            "Speed up claim triage without removing human decisions",
            "Demonstrate GDPR-compliant AI use to the regulator",
          ],
          opportunityStatus: "proposal",
        },
        {
          cloud: "gcp",
          expectedUsers: 350,
          concurrencyTier: "departmental",
          complianceTier: "regulated",
          externalSystemCount: 2,
          dataComplexity: "high",
          currency: "EUR",
          teamCapacity: 6,
          targetDeadlineWeeks: 24,
        },
        [
          makeSource(
            "SRC-001",
            "Claims assistant business brief.txt",
            "txt",
            MERIDIAN_BRIEF,
          ),
          makeSource(
            "SRC-002",
            "Steering meeting notes.md",
            "md",
            MERIDIAN_NOTES,
          ),
        ],
      ),
  },
  {
    id: "brightwave-missing-info",
    title: "Brightwave Education - learner platform",
    shape: "Important information missing",
    summary:
      "Vague call notes: no user volume, deadline, budget, cloud or integration detail. Expect many questions, assumptions and low confidence.",
    build: () =>
      scenarioModel(
        "Brightwave Learner Platform",
        {
          customerName: "Brightwave Education",
          opportunityName: "Learner Engagement Platform",
          industry: "Education technology",
          businessObjectives: [
            "Launch a learner platform serving schools and individuals",
          ],
          opportunityStatus: "qualifying",
        },
        {
          cloud: null,
          cloudSelectionMode: "recommended",
          expectedUsers: 0,
          concurrencyTier: "pilot",
          complianceTier: "standard",
          externalSystemCount: 0,
          dataComplexity: "medium",
          currency: "USD",
          teamCapacity: 4,
          targetDeadlineWeeks: null,
        },
        [
          makeSource(
            "SRC-001",
            "Founder call notes.md",
            "md",
            BRIGHTWAVE_NOTES,
          ),
          makeSource(
            "SRC-002",
            "Founder follow-up email.txt",
            "txt",
            BRIGHTWAVE_EMAIL,
          ),
        ],
      ),
  },
];

export function scenarioList(): readonly ScenarioInfo[] {
  return SCENARIOS.map(({ id, title, shape, summary }) => ({
    id,
    title,
    shape,
    summary,
  }));
}

export function scenarioModelFor(id: ScenarioId): ScopeModel {
  const found = SCENARIOS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown scenario: ${id}`);
  return found.build();
}
