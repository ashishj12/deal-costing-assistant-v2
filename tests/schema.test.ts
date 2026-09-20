import { describe, it, expect } from "vitest";
import { s, SchemaError } from "../src/domain/schema";
import { RequirementSchema, ScopeModelSchema } from "../src/domain/entities";
import { seedModel } from "../src/data/seed";

describe("schema", () => {
  it("rejects a wrong primitive type with a path", () => {
    const result = s.object({ a: s.string() }).safeParse({ a: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.path).toBe("a");
      expect(result.issues[0]?.code).toBe("invalid_type");
    }
  });

  it("reports a missing required field distinctly from a bad value", () => {
    const result = s.object({ a: s.string() }).safeParse({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues[0]?.code).toBe("missing");
  });

  it("applies defaults only when the value is undefined", () => {
    const schema = s.object({ n: s.number().default(7) });
    expect(schema.parse({}).n).toBe(7);
    expect(schema.parse({ n: 0 }).n).toBe(0);
  });

  it("throws SchemaError from parse", () => {
    expect(() => s.string().parse(1)).toThrow("Schema validation failed");
    try {
      s.string().parse(1);
    } catch (error) {
      expect(error instanceof SchemaError).toBe(true);
    }
  });

  it("enforces enum membership", () => {
    expect(s.enum(["a", "b"] as const).safeParse("c").ok).toBe(false);
    expect(s.enum(["a", "b"] as const).safeParse("a").ok).toBe(true);
  });

  it("collects issues from every array element rather than stopping at the first", () => {
    const result = s.array(s.number()).safeParse([1, "x", "y"]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBe(2);
  });
});

describe("domain invariants", () => {
  it("refuses a customer-stated requirement with no source span", () => {
    const result = RequirementSchema.safeParse({
      id: "REQ-001",
      type: "functional",
      description: "The system must do the thing the customer asked for.",
      priority: "must",
      provenance: "customer-stated",
      sourceSpan: null,
      citationResolved: false,
      status: "in-review",
      confidence: 0.9,
      introducedInVersion: 1,
      lastModifiedInVersion: 1,
    });
    expect(result.ok).toBe(false);
  });

  it("refuses citationResolved without a span", () => {
    const result = RequirementSchema.safeParse({
      id: "REQ-001",
      type: "functional",
      description: "The system must do the thing the customer asked for.",
      priority: "must",
      provenance: "ai-inferred",
      sourceSpan: null,
      citationResolved: true,
      status: "in-review",
      confidence: 0.9,
      introducedInVersion: 1,
      lastModifiedInVersion: 1,
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a malformed identifier", () => {
    const result = RequirementSchema.safeParse({
      id: "REQ-1",
      type: "functional",
      description: "The system must do the thing the customer asked for.",
      priority: "must",
      provenance: "ai-inferred",
      sourceSpan: null,
      citationResolved: false,
      status: "in-review",
      confidence: 0.9,
      introducedInVersion: 1,
      lastModifiedInVersion: 1,
    });
    expect(result.ok).toBe(false);
  });

  it("round-trips the seeded model through its own schema", () => {
    const model = seedModel();
    const result = ScopeModelSchema.safeParse(
      JSON.parse(JSON.stringify(model)),
    );
    expect(result.ok).toBe(true);
  });
});
