import { describe, it, expect } from "vitest";
import { InMemoryRepository, validateWorkspace } from "../src/data/repository";
import { seedModel } from "../src/data/seed";

describe("repository contract", () => {
  it("returns null before anything is saved", async () => {
    expect(await new InMemoryRepository().load()).toBeNull();
  });

  it("round-trips a workspace", async () => {
    const repository = new InMemoryRepository();
    const model = seedModel();
    await repository.save({ model, artifacts: {} });
    const loaded = await repository.load();
    expect(loaded).toBeTruthy();
    expect(loaded!.model.projectName).toBe(model.projectName);
  });

  it("returns a copy, so mutating the result cannot corrupt the store", async () => {
    const repository = new InMemoryRepository();
    await repository.save({ model: seedModel(), artifacts: {} });
    const first = await repository.load();
    first!.model.projectName = "mutated";
    const second = await repository.load();
    expect(second!.model.projectName).not.toBe("mutated");
  });

  it("clears", async () => {
    const repository = new InMemoryRepository();
    await repository.save({ model: seedModel(), artifacts: {} });
    await repository.clear();
    expect(await repository.load()).toBeNull();
  });

  it("fails closed on corrupt persisted state", () => {
    expect(
      validateWorkspace({ model: { version: "not a number" } }),
    ).toBeNull();
    expect(validateWorkspace(null)).toBeNull();
    expect(validateWorkspace("{}")).toBeNull();
  });

  it("accepts a valid workspace with missing artifacts", () => {
    const workspace = validateWorkspace({
      model: JSON.parse(JSON.stringify(seedModel())),
    });
    expect(workspace).toBeTruthy();
    expect(workspace!.artifacts).toEqual({});
  });
});
