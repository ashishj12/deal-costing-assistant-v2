import * as fs from "fs";
import * as path from "path";

interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
  suite: string;
}

const cases: TestCase[] = [];
let currentSuite = "";
let failures = 0;
let passes = 0;
const failureDetail: string[] = [];

function describe(name: string, fn: () => void): void {
  const previous = currentSuite;
  currentSuite = previous ? `${previous} > ${name}` : name;
  fn();
  currentSuite = previous;
}

function it(name: string, fn: () => void | Promise<void>): void {
  cases.push({ name, fn, suite: currentSuite });
}

function stringify(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (typeof a !== "object") return false;
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const ak = Object.keys(ao);
  const bk = Object.keys(bo);
  if (ak.length !== bk.length) return false;
  return ak.every((key) => deepEqual(ao[key], bo[key]));
}

function fail(message: string): never {
  throw new Error(message);
}

function expect(actual: unknown) {
  const api = {
    toBe(expected: unknown) {
      if (actual !== expected)
        fail(`expected ${stringify(actual)} to be ${stringify(expected)}`);
    },
    toEqual(expected: unknown) {
      if (!deepEqual(actual, expected))
        fail(`expected ${stringify(actual)} to equal ${stringify(expected)}`);
    },
    toBeCloseTo(expected: number, precision = 2) {
      const diff = Math.abs((actual as number) - expected);
      if (diff > 10 ** -precision / 2)
        fail(`expected ${actual} to be close to ${expected}`);
    },
    toBeTruthy() {
      if (!actual) fail(`expected ${stringify(actual)} to be truthy`);
    },
    toBeFalsy() {
      if (actual) fail(`expected ${stringify(actual)} to be falsy`);
    },
    toBeNull() {
      if (actual !== null) fail(`expected ${stringify(actual)} to be null`);
    },
    toContain(expected: unknown) {
      const ok =
        typeof actual === "string"
          ? actual.includes(String(expected))
          : Array.isArray(actual) &&
            actual.some((entry) => deepEqual(entry, expected));
      if (!ok)
        fail(`expected ${stringify(actual)} to contain ${stringify(expected)}`);
    },
    toHaveLength(expected: number) {
      const length = (actual as { length?: number })?.length;
      if (length !== expected)
        fail(`expected length ${length} to be ${expected}`);
    },
    toBeGreaterThan(expected: number) {
      if (!((actual as number) > expected))
        fail(`expected ${actual} > ${expected}`);
    },
    toBeLessThan(expected: number) {
      if (!((actual as number) < expected))
        fail(`expected ${actual} < ${expected}`);
    },
    toBeGreaterThanOrEqual(expected: number) {
      if (!((actual as number) >= expected))
        fail(`expected ${actual} >= ${expected}`);
    },
    toBeLessThanOrEqual(expected: number) {
      if (!((actual as number) <= expected))
        fail(`expected ${actual} <= ${expected}`);
    },
    toThrow(expected?: string) {
      let threw = false;
      let message = "";
      try {
        (actual as () => unknown)();
      } catch (error) {
        threw = true;
        message = error instanceof Error ? error.message : String(error);
      }
      if (!threw) fail("expected the function to throw");
      if (expected && !message.includes(expected))
        fail(`expected error "${message}" to contain "${expected}"`);
    },
    not: {
      toBe(expected: unknown) {
        if (actual === expected)
          fail(
            `expected ${stringify(actual)} not to be ${stringify(expected)}`,
          );
      },
      toEqual(expected: unknown) {
        if (deepEqual(actual, expected))
          fail(`expected values not to be equal`);
      },
      toContain(expected: unknown) {
        const ok =
          typeof actual === "string"
            ? actual.includes(String(expected))
            : Array.isArray(actual) &&
              actual.some((entry) => deepEqual(entry, expected));
        if (ok)
          fail(
            `expected ${stringify(actual)} not to contain ${stringify(expected)}`,
          );
      },
      toThrow() {
        try {
          (actual as () => unknown)();
        } catch (error) {
          fail(
            `expected the function not to throw, but it threw: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      },
    },
  };
  return api;
}

// Test files import { describe, it, expect } from "vitest" so that the exact
// same files run under Vitest once dependencies are installed. Here, the
// module resolver is pointed at this runner's implementation instead.
const api = {
  describe,
  it,
  expect,
  test: it,
  beforeEach: (fn: () => void) => fn,
  afterEach: (_fn: () => void) => undefined,
};

const globalScope = globalThis as unknown as Record<string, unknown>;
globalScope["describe"] = describe;
globalScope["it"] = it;
globalScope["expect"] = expect;
globalScope["test"] = it;

interface LoaderModule {
  _load(request: string, parent: unknown, isMain: boolean): unknown;
}
const Module = require("module") as LoaderModule;
const originalLoad = Module._load.bind(Module);
Module._load = (request: string, parent: unknown, isMain: boolean): unknown => {
  if (request === "vitest") return api;
  return originalLoad(request, parent, isMain);
};

function collect(directory: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (fs.statSync(full).isDirectory()) found.push(...collect(full));
    else if (entry.endsWith(".test.ts")) found.push(full);
  }
  return found;
}

async function run(): Promise<void> {
  const root = path.resolve(__dirname, "..");
  const files = collect(path.join(root, "tests")).sort();

  for (const file of files) {
    currentSuite = "";
    require(file);
  }

  const started = Date.now();
  for (const testCase of cases) {
    try {
      await testCase.fn();
      passes += 1;
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      failureDetail.push(
        `  FAIL  ${testCase.suite} > ${testCase.name}\n        ${message}`,
      );
    }
  }
  const elapsed = Date.now() - started;

  process.stdout.write(
    `\n${files.length} test file(s), ${cases.length} test(s)\n`,
  );
  if (failureDetail.length > 0) {
    process.stdout.write(`\n${failureDetail.join("\n")}\n`);
  }
  process.stdout.write(
    `\n  ${passes} passed, ${failures} failed  (${elapsed}ms)\n\n`,
  );
  if (failures > 0) process.exit(1);
}

void run();
