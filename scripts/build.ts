import * as fs from "fs";
import * as path from "path";

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "dist");
const cjsDir = path.join(outDir, "cjs");

function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

function compile(): void {
  const { execSync } = require("child_process") as {
    execSync: (cmd: string, options: { cwd: string; stdio: string }) => void;
  };
  log("Compiling TypeScript to CommonJS\u2026");
  execSync("npx tsc -p tsconfig.json", { cwd: root, stdio: "inherit" });
}

function collect(directory: string, base: string): string[] {
  const found: string[] = [];
  if (!fs.existsSync(directory)) return found;
  for (const entry of fs.readdirSync(directory)) {
    const full = path.join(directory, entry);
    if (fs.statSync(full).isDirectory()) found.push(...collect(full, base));
    else if (entry.endsWith(".js"))
      found.push(path.relative(base, full).split(path.sep).join("/"));
  }
  return found;
}

function bundle(): string {
  const sourceRoot = path.join(cjsDir, "src");
  const modules = collect(sourceRoot, cjsDir).filter(
    (m) => !m.includes("/scripts/"),
  );
  const parts: string[] = [];
  for (const moduleId of modules) {
    const code = fs.readFileSync(path.join(cjsDir, moduleId), "utf8");
    parts.push(
      `__def(${JSON.stringify(moduleId)}, function (exports, require, module) {\n${code}\n});`,
    );
  }
  return parts.join("\n");
}

const LOADER = `
(function () {
  var __registry = {};
  var __cache = {};
  function __def(id, factory) { __registry[id] = factory; }
  function __normalise(base, id) {
    if (id.charAt(0) !== ".") return id;
    var parts = base.split("/").slice(0, -1).concat(id.split("/"));
    var stack = [];
    for (var i = 0; i < parts.length; i++) {
      var part = parts[i];
      if (part === "." || part === "") continue;
      if (part === "..") stack.pop();
      else stack.push(part);
    }
    var resolved = stack.join("/");
    if (__registry[resolved + ".js"]) return resolved + ".js";
    if (__registry[resolved + "/index.js"]) return resolved + "/index.js";
    return resolved + ".js";
  }
  function __makeRequire(base) {
    return function (id) {
      var resolved = __normalise(base, id);
      if (__cache[resolved]) return __cache[resolved].exports;
      var factory = __registry[resolved];
      if (!factory) throw new Error("Module not found: " + id + " (from " + base + ")");
      var module = { exports: {} };
      __cache[resolved] = module;
      factory(module.exports, __makeRequire(resolved), module);
      return module.exports;
    };
  }
  __MODULES__
  __makeRequire("src/entry.js")("./ui/main");
})();
`;

function html(tokens: string, app: string, bundled: string): string {
  return `<!doctype html>
<html lang="en" data-theme="auto">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Deal Scoping Assistant</title>
<meta name="description" content="AI-assisted deal scoping: traceable requirements, deterministic estimation and change-impact analysis.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap">
<style>
${tokens}
${app}
</style>
</head>
<body>
<div id="root"></div>
<script>
${bundled}
</script>
</body>
</html>
`;
}

function main(): void {
  if (fs.existsSync(outDir))
    fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  compile();

  log("Bundling modules\u2026");
  const modules = bundle();
  const loader = LOADER.replace("__MODULES__", modules);

  const tokens = fs.readFileSync(
    path.join(root, "src/styles/tokens.css"),
    "utf8",
  );
  const app = fs.readFileSync(path.join(root, "src/styles/app.css"), "utf8");

  const document = html(tokens, app, loader);
  fs.writeFileSync(path.join(outDir, "index.html"), document, "utf8");

  const bytes = document.length;
  log(
    `Wrote dist/index.html (${(bytes / 1024).toFixed(1)} KB, no external scripts)`,
  );
}

main();
