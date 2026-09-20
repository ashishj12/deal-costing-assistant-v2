declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  cwd(): string;
  stdout: { write(chunk: string): boolean };
};

declare const __dirname: string;
declare const module: { exports: unknown };
declare function require(id: string): unknown;

declare module "fs" {
  export function readFileSync(path: string, encoding: string): string;
  export function writeFileSync(
    path: string,
    data: string,
    encoding?: string,
  ): void;
  export function existsSync(path: string): boolean;
  export function mkdirSync(
    path: string,
    options?: { recursive?: boolean },
  ): void;
  export function readdirSync(path: string): string[];
  export function statSync(path: string): {
    isDirectory(): boolean;
    isFile(): boolean;
    size: number;
  };
  export function rmSync(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): void;
}

declare module "path" {
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function dirname(p: string): string;
  export function basename(p: string, ext?: string): string;
  export function relative(from: string, to: string): string;
  export function extname(p: string): string;
  export const sep: string;
}

declare module "vitest" {
  export const describe: (name: string, fn: () => void) => void;
  export const it: (name: string, fn: () => void | Promise<void>) => void;
  export const expect: (actual: unknown) => {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeCloseTo(expected: number, precision?: number): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeNull(): void;
    toContain(expected: unknown): void;
    toHaveLength(expected: number): void;
    toBeGreaterThan(expected: number): void;
    toBeLessThan(expected: number): void;
    toBeGreaterThanOrEqual(expected: number): void;
    toBeLessThanOrEqual(expected: number): void;
    toThrow(expected?: string): void;
    not: {
      toBe(expected: unknown): void;
      toEqual(expected: unknown): void;
      toContain(expected: unknown): void;
      toThrow(expected?: string): void;
    };
  };
}

declare module "vitest/config" {
  export function defineConfig<T>(config: T): T;
}

declare module "module" {
  const Module: {
    _load(request: string, parent: unknown, isMain: boolean): unknown;
  };
  export = Module;
}

declare module "child_process" {
  export function execSync(
    command: string,
    options?: { cwd?: string; stdio?: string },
  ): void;
  export function spawn(
    command: string,
    args: string[],
    options?: { cwd?: string; stdio?: string },
  ): unknown;
}
