const http = require("http");
const fs = require("fs");
const path = require("path");

try {
  const envFile = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith("#") && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
} catch {
  /* .env is optional: mock AI mode needs no configuration */
}

const root = path.join(__dirname, "..", "dist");
const LIVE =
  process.env.AI_PROVIDER === "gemini" && Boolean(process.env.GEMINI_API_KEY);
const MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const send = (res, status, body) =>
  res
    .writeHead(status, { "Content-Type": "application/json" })
    .end(JSON.stringify(body));
const port = Number(process.env.PORT || 5173);

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
};

http
  .createServer((req, res) => {
    // Runtime provider discovery. The API key never reaches the browser.
    if (req.url === "/api/config") {
      return send(res, 200, {
        provider: LIVE ? "gemini" : "mock",
        model: MODEL,
      });
    }
    // Server-side proxy: the browser posts the prompt, the key is added here.
    if (req.method === "POST" && (req.url || "").split("?")[0] === "/api/ai") {
      if (!LIVE)
        return send(res, 503, { error: "Live AI provider not configured" });
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", async () => {
        try {
          const upstream = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: Buffer.concat(chunks),
            },
          );
          res
            .writeHead(upstream.status, { "Content-Type": "application/json" })
            .end(await upstream.text());
        } catch {
          send(res, 502, { error: "Upstream provider unreachable" });
        }
      });
      return;
    }
    const requested = decodeURIComponent((req.url || "/").split("?")[0]);
    const file = path.join(root, requested === "/" ? "index.html" : requested);
    if (!file.startsWith(root)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404, { "Content-Type": "text/plain" }).end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(file)] || "application/octet-stream",
      });
      res.end(data);
    });
  })
  .listen(port, () => {
    process.stdout.write(
      `Deal Scoping Assistant running at http://localhost:${port} (AI mode: ${LIVE ? "gemini via server proxy" : "mock"})\n`,
    );
  });
