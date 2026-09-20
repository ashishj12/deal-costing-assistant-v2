import { Cloud } from "../domain/entities";

export interface CloudServiceEntry {
  readonly key: string;
  readonly layer:
    | "edge"
    | "application"
    | "integration"
    | "data"
    | "ai"
    | "security"
    | "observability";
  readonly service: string;
  readonly constraints: string;
  readonly tradeoffs: readonly string[];
}

const CATALOG: Record<Cloud, readonly CloudServiceEntry[]> = {
  aws: [
    {
      key: "cdn",
      layer: "edge",
      service: "Amazon CloudFront",
      constraints:
        "Regional edge caches; invalidation is eventually consistent.",
      tradeoffs: [
        "Cache invalidation latency",
        "Per-request pricing at high volume",
      ],
    },
    {
      key: "waf",
      layer: "security",
      service: "AWS WAF",
      constraints: "Rule evaluation counts against request pricing.",
      tradeoffs: ["Managed rule tuning effort"],
    },
    {
      key: "api",
      layer: "edge",
      service: "Amazon API Gateway",
      constraints: "29s integration timeout; 10MB payload limit.",
      tradeoffs: [
        "Timeout ceiling unsuitable for long jobs",
        "Cost above ~1M requests/day vs ALB",
      ],
    },
    {
      key: "compute",
      layer: "application",
      service: "AWS Fargate on ECS",
      constraints: "No GPU; cold start on scale-out.",
      tradeoffs: [
        "Higher unit cost than EC2 at steady load",
        "No node-level tuning",
      ],
    },
    {
      key: "queue",
      layer: "integration",
      service: "Amazon SQS",
      constraints: "At-least-once delivery; 256KB message limit.",
      tradeoffs: ["Consumers must be idempotent"],
    },
    {
      key: "events",
      layer: "integration",
      service: "Amazon EventBridge",
      constraints: "256KB event size; schema registry optional.",
      tradeoffs: ["Debugging fan-out requires tracing"],
    },
    {
      key: "oltp",
      layer: "data",
      service: "Amazon Aurora PostgreSQL",
      constraints: "Single writer per cluster unless multi-master.",
      tradeoffs: [
        "Write scaling requires sharding or Limitless",
        "Higher cost than RDS",
      ],
    },
    {
      key: "cache",
      layer: "data",
      service: "Amazon ElastiCache for Redis",
      constraints: "In-memory; failover takes seconds.",
      tradeoffs: ["Memory cost", "Cache invalidation complexity"],
    },
    {
      key: "object",
      layer: "data",
      service: "Amazon S3",
      constraints:
        "Strong read-after-write; eventual for some list operations.",
      tradeoffs: ["Request cost on chatty access patterns"],
    },
    {
      key: "warehouse",
      layer: "data",
      service: "Amazon Redshift Serverless",
      constraints: "Concurrency scaling billed separately.",
      tradeoffs: ["Cost variability under bursty analytics"],
    },
    {
      key: "ai",
      layer: "ai",
      service: "Amazon Bedrock",
      constraints: "Model availability varies by region.",
      tradeoffs: ["Region constraints may force data residency exceptions"],
    },
    {
      key: "vector",
      layer: "ai",
      service: "Amazon OpenSearch Serverless (vector)",
      constraints: "Minimum OCU billing floor.",
      tradeoffs: ["Baseline cost even when idle"],
    },
    {
      key: "identity",
      layer: "security",
      service: "Amazon Cognito",
      constraints: "Customised flows require Lambda triggers.",
      tradeoffs: ["Limited enterprise federation ergonomics"],
    },
    {
      key: "secrets",
      layer: "security",
      service: "AWS Secrets Manager",
      constraints: "Per-secret monthly charge.",
      tradeoffs: ["Cost at high secret counts vs Parameter Store"],
    },
    {
      key: "observability",
      layer: "observability",
      service: "Amazon CloudWatch and X-Ray",
      constraints: "Log ingestion is the dominant cost driver.",
      tradeoffs: ["Retention tuning required"],
    },
  ],
  azure: [
    {
      key: "cdn",
      layer: "edge",
      service: "Azure Front Door",
      constraints: "WAF and CDN are combined at the premium tier.",
      tradeoffs: ["Premium tier needed for private origin"],
    },
    {
      key: "waf",
      layer: "security",
      service: "Azure WAF on Front Door",
      constraints: "Managed rule sets update on Microsoft's cadence.",
      tradeoffs: ["Less granular than self-managed rules"],
    },
    {
      key: "api",
      layer: "edge",
      service: "Azure API Management",
      constraints: "Developer tier has no SLA; scaling is by unit.",
      tradeoffs: ["Step-function cost per scale unit"],
    },
    {
      key: "compute",
      layer: "application",
      service: "Azure Container Apps",
      constraints: "KEDA-based scaling; regional availability varies.",
      tradeoffs: ["Less control than AKS", "Cold start on scale-to-zero"],
    },
    {
      key: "queue",
      layer: "integration",
      service: "Azure Service Bus",
      constraints: "Sessions required for ordered processing.",
      tradeoffs: ["Premium tier needed for predictable throughput"],
    },
    {
      key: "events",
      layer: "integration",
      service: "Azure Event Grid",
      constraints: "At-least-once delivery with retry policy.",
      tradeoffs: ["Dead-letter handling must be explicit"],
    },
    {
      key: "oltp",
      layer: "data",
      service: "Azure Database for PostgreSQL Flexible Server",
      constraints: "Read replicas are asynchronous.",
      tradeoffs: ["Failover window", "Write scaling needs partitioning"],
    },
    {
      key: "cache",
      layer: "data",
      service: "Azure Cache for Redis",
      constraints: "Clustering only on premium tiers.",
      tradeoffs: ["Tier jump for clustering"],
    },
    {
      key: "object",
      layer: "data",
      service: "Azure Blob Storage",
      constraints: "Access tiers affect retrieval latency and cost.",
      tradeoffs: ["Rehydration delay from archive tier"],
    },
    {
      key: "warehouse",
      layer: "data",
      service: "Azure Synapse Analytics",
      constraints: "Dedicated pools bill while provisioned.",
      tradeoffs: ["Idle cost unless serverless"],
    },
    {
      key: "ai",
      layer: "ai",
      service: "Azure OpenAI Service",
      constraints: "Quota is per-region and per-model.",
      tradeoffs: ["Quota approval lead time"],
    },
    {
      key: "vector",
      layer: "ai",
      service: "Azure AI Search (vector)",
      constraints: "Index size limits per tier.",
      tradeoffs: ["Tier upgrade required as corpus grows"],
    },
    {
      key: "identity",
      layer: "security",
      service: "Microsoft Entra ID",
      constraints: "B2C is a separate tenant model.",
      tradeoffs: ["B2B and B2C split adds complexity"],
    },
    {
      key: "secrets",
      layer: "security",
      service: "Azure Key Vault",
      constraints: "Throttling limits on high-frequency reads.",
      tradeoffs: ["Caching layer usually required"],
    },
    {
      key: "observability",
      layer: "observability",
      service: "Azure Monitor and Application Insights",
      constraints: "Sampling is on by default.",
      tradeoffs: ["Sampling can hide rare failures"],
    },
  ],
  gcp: [
    {
      key: "cdn",
      layer: "edge",
      service: "Cloud CDN",
      constraints: "Tied to external HTTP(S) Load Balancing.",
      tradeoffs: ["Load balancer required even for simple cases"],
    },
    {
      key: "waf",
      layer: "security",
      service: "Cloud Armor",
      constraints: "Rule evaluation order is explicit.",
      tradeoffs: ["Manual rule ordering effort"],
    },
    {
      key: "api",
      layer: "edge",
      service: "Apigee X",
      constraints: "Minimum environment commitment.",
      tradeoffs: ["High floor cost for small deployments"],
    },
    {
      key: "compute",
      layer: "application",
      service: "Cloud Run",
      constraints:
        "Request timeout up to 60 minutes; concurrency per instance.",
      tradeoffs: ["Stateless only", "Cold start on scale from zero"],
    },
    {
      key: "queue",
      layer: "integration",
      service: "Pub/Sub",
      constraints: "At-least-once; ordering keys reduce throughput.",
      tradeoffs: ["Ordering costs throughput"],
    },
    {
      key: "events",
      layer: "integration",
      service: "Eventarc",
      constraints: "Routes through Pub/Sub under the hood.",
      tradeoffs: ["Extra hop in latency budget"],
    },
    {
      key: "oltp",
      layer: "data",
      service: "Cloud SQL for PostgreSQL",
      constraints: "Vertical scaling ceiling; read replicas asynchronous.",
      tradeoffs: ["Spanner needed beyond the ceiling"],
    },
    {
      key: "cache",
      layer: "data",
      service: "Memorystore for Redis",
      constraints: "No cross-region replication on basic tier.",
      tradeoffs: ["Standard tier needed for HA"],
    },
    {
      key: "object",
      layer: "data",
      service: "Cloud Storage",
      constraints: "Strong global consistency.",
      tradeoffs: ["Egress cost across regions"],
    },
    {
      key: "warehouse",
      layer: "data",
      service: "BigQuery",
      constraints: "On-demand pricing is per byte scanned.",
      tradeoffs: ["Unpartitioned queries get expensive fast"],
    },
    {
      key: "ai",
      layer: "ai",
      service: "Vertex AI",
      constraints: "Model availability varies by region.",
      tradeoffs: ["Regional model gaps"],
    },
    {
      key: "vector",
      layer: "ai",
      service: "Vertex AI Vector Search",
      constraints: "Index rebuild required for large updates.",
      tradeoffs: ["Update latency on large corpora"],
    },
    {
      key: "identity",
      layer: "security",
      service: "Identity Platform",
      constraints: "Enterprise federation via SAML/OIDC.",
      tradeoffs: ["Fewer enterprise connectors than Entra"],
    },
    {
      key: "secrets",
      layer: "security",
      service: "Secret Manager",
      constraints: "Versioned secrets; access billed per operation.",
      tradeoffs: ["Client-side caching recommended"],
    },
    {
      key: "observability",
      layer: "observability",
      service: "Cloud Logging and Cloud Trace",
      constraints: "Log sink configuration affects retention cost.",
      tradeoffs: ["Sink misconfiguration causes silent data loss"],
    },
  ],
};

export function catalogFor(cloud: Cloud): readonly CloudServiceEntry[] {
  return CATALOG[cloud];
}

export function serviceFor(
  cloud: Cloud,
  key: string,
): CloudServiceEntry | undefined {
  return CATALOG[cloud].find((entry) => entry.key === key);
}

export const CLOUD_LABEL: Record<Cloud, string> = {
  aws: "Amazon Web Services",
  azure: "Microsoft Azure",
  gcp: "Google Cloud",
};

export function recommendCloud(signals: {
  mentionsMicrosoft: boolean;
  mentionsGoogleWorkspace: boolean;
  heavyAnalytics: boolean;
  regulated: boolean;
}): { cloud: Cloud; rationale: string } {
  if (signals.mentionsMicrosoft) {
    return {
      cloud: "azure",
      rationale:
        "Customer material references Microsoft identity or Office estate, so Entra ID federation and existing enterprise agreements reduce integration effort.",
    };
  }
  if (signals.mentionsGoogleWorkspace || signals.heavyAnalytics) {
    return {
      cloud: "gcp",
      rationale:
        "Analytics volume is the dominant driver; BigQuery removes a warehouse sizing decision and the customer already operates Google Workspace.",
    };
  }
  return {
    cloud: "aws",
    rationale: signals.regulated
      ? "Broadest set of compliance attestations and the widest regional footprint for data residency, with no countervailing signal towards another provider."
      : "No provider-specific signal in the customer material; defaulting to the broadest service catalogue and deepest available delivery skills.",
  };
}
