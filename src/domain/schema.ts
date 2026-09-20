export interface Issue {
  readonly path: string;
  readonly message: string;
  readonly code:
    | "invalid_type"
    | "invalid_value"
    | "too_small"
    | "too_big"
    | "missing"
    | "unknown_key"
    | "custom";
}

export type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly Issue[] };

export class SchemaError extends Error {
  public readonly issues: readonly Issue[];
  constructor(issues: readonly Issue[]) {
    super(
      `Schema validation failed:\n` +
        issues.map((i) => `  ${i.path || "<root>"}: ${i.message}`).join("\n"),
    );
    this.name = "SchemaError";
    this.issues = issues;
  }
}

const issue = (path: string, message: string, code: Issue["code"]): Issue => ({
  path,
  message,
  code,
});

export abstract class Schema<T> {
  abstract _parse(value: unknown, path: string): ParseResult<T>;

  safeParse(value: unknown): ParseResult<T> {
    return this._parse(value, "");
  }

  parse(value: unknown): T {
    const r = this._parse(value, "");
    if (!r.ok) throw new SchemaError(r.issues);
    return r.value;
  }

  optional(): Schema<T | undefined> {
    return new OptionalSchema(this);
  }

  nullable(): Schema<T | null> {
    return new NullableSchema(this);
  }

  default(fallback: T | (() => T)): Schema<T> {
    return new DefaultSchema(this, fallback);
  }

  refine(check: (value: T) => boolean, message: string): Schema<T> {
    return new RefinedSchema(this, check, message);
  }
}

class OptionalSchema<T> extends Schema<T | undefined> {
  constructor(private readonly inner: Schema<T>) {
    super();
  }
  _parse(value: unknown, path: string): ParseResult<T | undefined> {
    if (value === undefined) return { ok: true, value: undefined };
    return this.inner._parse(value, path);
  }
}

class NullableSchema<T> extends Schema<T | null> {
  constructor(private readonly inner: Schema<T>) {
    super();
  }
  _parse(value: unknown, path: string): ParseResult<T | null> {
    if (value === null) return { ok: true, value: null };
    return this.inner._parse(value, path);
  }
}

class DefaultSchema<T> extends Schema<T> {
  constructor(
    private readonly inner: Schema<T>,
    private readonly fallback: T | (() => T),
  ) {
    super();
  }
  _parse(value: unknown, path: string): ParseResult<T> {
    if (value === undefined) {
      const v =
        typeof this.fallback === "function"
          ? (this.fallback as () => T)()
          : this.fallback;
      return { ok: true, value: v };
    }
    return this.inner._parse(value, path);
  }
}

class RefinedSchema<T> extends Schema<T> {
  constructor(
    private readonly inner: Schema<T>,
    private readonly check: (value: T) => boolean,
    private readonly message: string,
  ) {
    super();
  }
  _parse(value: unknown, path: string): ParseResult<T> {
    const r = this.inner._parse(value, path);
    if (!r.ok) return r;
    if (!this.check(r.value)) {
      return { ok: false, issues: [issue(path, this.message, "custom")] };
    }
    return r;
  }
}

class StringSchema extends Schema<string> {
  private min = 0;
  private max = Number.MAX_SAFE_INTEGER;
  private pattern: RegExp | null = null;

  minLength(n: number): this {
    this.min = n;
    return this;
  }
  maxLength(n: number): this {
    this.max = n;
    return this;
  }
  regex(re: RegExp): this {
    this.pattern = re;
    return this;
  }

  _parse(value: unknown, path: string): ParseResult<string> {
    if (typeof value !== "string") {
      return {
        ok: false,
        issues: [issue(path, "expected a string", "invalid_type")],
      };
    }
    if (value.length < this.min) {
      return {
        ok: false,
        issues: [
          issue(path, `must be at least ${this.min} characters`, "too_small"),
        ],
      };
    }
    if (value.length > this.max) {
      return {
        ok: false,
        issues: [
          issue(path, `must be at most ${this.max} characters`, "too_big"),
        ],
      };
    }
    if (this.pattern && !this.pattern.test(value)) {
      return {
        ok: false,
        issues: [issue(path, `must match ${this.pattern}`, "invalid_value")],
      };
    }
    return { ok: true, value };
  }
}

class NumberSchema extends Schema<number> {
  private min = -Infinity;
  private max = Infinity;
  private intOnly = false;

  gte(n: number): this {
    this.min = n;
    return this;
  }
  lte(n: number): this {
    this.max = n;
    return this;
  }
  int(): this {
    this.intOnly = true;
    return this;
  }

  _parse(value: unknown, path: string): ParseResult<number> {
    if (typeof value !== "number" || Number.isNaN(value)) {
      return {
        ok: false,
        issues: [issue(path, "expected a number", "invalid_type")],
      };
    }
    if (!Number.isFinite(value)) {
      return {
        ok: false,
        issues: [issue(path, "must be finite", "invalid_value")],
      };
    }
    if (this.intOnly && !Number.isInteger(value)) {
      return {
        ok: false,
        issues: [issue(path, "must be an integer", "invalid_value")],
      };
    }
    if (value < this.min) {
      return {
        ok: false,
        issues: [issue(path, `must be >= ${this.min}`, "too_small")],
      };
    }
    if (value > this.max) {
      return {
        ok: false,
        issues: [issue(path, `must be <= ${this.max}`, "too_big")],
      };
    }
    return { ok: true, value };
  }
}

class BooleanSchema extends Schema<boolean> {
  _parse(value: unknown, path: string): ParseResult<boolean> {
    if (typeof value !== "boolean") {
      return {
        ok: false,
        issues: [issue(path, "expected a boolean", "invalid_type")],
      };
    }
    return { ok: true, value };
  }
}

class EnumSchema<T extends string> extends Schema<T> {
  constructor(public readonly values: readonly T[]) {
    super();
  }
  _parse(value: unknown, path: string): ParseResult<T> {
    if (typeof value !== "string" || !this.values.includes(value as T)) {
      return {
        ok: false,
        issues: [
          issue(
            path,
            `expected one of: ${this.values.join(", ")}`,
            "invalid_value",
          ),
        ],
      };
    }
    return { ok: true, value: value as T };
  }
}

class ArraySchema<T> extends Schema<T[]> {
  private min = 0;
  constructor(private readonly item: Schema<T>) {
    super();
  }
  nonEmpty(): this {
    this.min = 1;
    return this;
  }
  _parse(value: unknown, path: string): ParseResult<T[]> {
    if (!Array.isArray(value)) {
      return {
        ok: false,
        issues: [issue(path, "expected an array", "invalid_type")],
      };
    }
    if (value.length < this.min) {
      return {
        ok: false,
        issues: [issue(path, "must not be empty", "too_small")],
      };
    }
    const out: T[] = [];
    const issues: Issue[] = [];
    value.forEach((entry, index) => {
      const r = this.item._parse(entry, `${path}[${index}]`);
      if (r.ok) out.push(r.value);
      else issues.push(...r.issues);
    });
    return issues.length > 0 ? { ok: false, issues } : { ok: true, value: out };
  }
}

class RecordSchema<T> extends Schema<Record<string, T>> {
  constructor(private readonly item: Schema<T>) {
    super();
  }
  _parse(value: unknown, path: string): ParseResult<Record<string, T>> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {
        ok: false,
        issues: [issue(path, "expected an object", "invalid_type")],
      };
    }
    const out: Record<string, T> = {};
    const issues: Issue[] = [];
    for (const [key, entry] of Object.entries(value)) {
      const r = this.item._parse(entry, path ? `${path}.${key}` : key);
      if (r.ok) out[key] = r.value;
      else issues.push(...r.issues);
    }
    return issues.length > 0 ? { ok: false, issues } : { ok: true, value: out };
  }
}

type Shape = Record<string, Schema<unknown>>;
type InferShape<S extends Shape> = {
  [K in keyof S]: S[K] extends Schema<infer U> ? U : never;
};

class ObjectSchema<S extends Shape> extends Schema<InferShape<S>> {
  constructor(public readonly shape: S) {
    super();
  }
  _parse(value: unknown, path: string): ParseResult<InferShape<S>> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return {
        ok: false,
        issues: [issue(path, "expected an object", "invalid_type")],
      };
    }
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    const issues: Issue[] = [];
    for (const [key, schema] of Object.entries(this.shape)) {
      const childPath = path ? `${path}.${key}` : key;
      const raw = source[key];
      const r = schema._parse(raw, childPath);
      if (r.ok) {
        if (r.value !== undefined) out[key] = r.value;
      } else {
        if (raw === undefined) {
          issues.push(issue(childPath, "required field is missing", "missing"));
        } else {
          issues.push(...r.issues);
        }
      }
    }
    return issues.length > 0
      ? { ok: false, issues }
      : { ok: true, value: out as InferShape<S> };
  }
}

class UnionSchema<T> extends Schema<T> {
  constructor(private readonly options: readonly Schema<T>[]) {
    super();
  }
  _parse(value: unknown, path: string): ParseResult<T> {
    for (const option of this.options) {
      const r = option._parse(value, path);
      if (r.ok) return r;
    }
    return {
      ok: false,
      issues: [issue(path, "did not match any variant", "invalid_value")],
    };
  }
}

export const s = {
  string: (): StringSchema => new StringSchema(),
  number: (): NumberSchema => new NumberSchema(),
  boolean: (): BooleanSchema => new BooleanSchema(),
  enum: <T extends string>(values: readonly T[]): EnumSchema<T> =>
    new EnumSchema(values),
  array: <T>(item: Schema<T>): ArraySchema<T> => new ArraySchema(item),
  record: <T>(item: Schema<T>): RecordSchema<T> => new RecordSchema(item),
  object: <S extends Shape>(shape: S): ObjectSchema<S> =>
    new ObjectSchema(shape),
  union: <T>(options: readonly Schema<T>[]): UnionSchema<T> =>
    new UnionSchema(options),
};

export type Infer<S> = S extends Schema<infer T> ? T : never;
