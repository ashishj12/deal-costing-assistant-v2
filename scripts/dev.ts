import * as path from "path";

const { execSync, spawn } = require("child_process") as {
  execSync: (cmd: string, o: { cwd: string; stdio: string }) => void;
  spawn: (cmd: string, args: string[], o: { cwd: string; stdio: string }) => unknown;
};

const root = path.resolve(__dirname, "..");
execSync("npx tsx scripts/build.ts", { cwd: root, stdio: "inherit" });
spawn("node", ["scripts/serve.js"], { cwd: root, stdio: "inherit" });
