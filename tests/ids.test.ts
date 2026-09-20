import { describe, it, expect } from "vitest";
import { artifactId, ID_PATTERNS, isId, nextId } from "../src/domain/ids";

describe("identifiers", () => {
  it("allocates the first identifier of a kind", () => {
    expect(nextId("requirement", [])).toBe("REQ-001");
  });

  it("never reuses a retired identifier", () => {
    const existing = ["REQ-001", "REQ-002", "REQ-003"];
    const afterDelete = ["REQ-001", "REQ-003"];
    expect(nextId("requirement", existing)).toBe("REQ-004");
    expect(nextId("requirement", [...afterDelete, ...existing])).toBe(
      "REQ-004",
    );
  });

  it("ignores identifiers of other kinds", () => {
    expect(nextId("question", ["REQ-009", "QST-002"])).toBe("QST-003");
  });

  it("validates identifier shape", () => {
    expect(isId("requirement", "REQ-012")).toBe(true);
    expect(isId("requirement", "REQ-12")).toBe(false);
    expect(ID_PATTERNS.artifact.test(artifactId("prd", 3))).toBe(true);
  });
});
