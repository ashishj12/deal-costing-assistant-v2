import { mountApp } from "./app";
import { Store } from "./state";
import { MockProvider } from "../ai/mock-provider";
import { GeminiProvider } from "../ai/gemini-provider";
import { AiProvider } from "../ai/provider";
import { BrowserStorageRepository } from "../data/repository";

/**
 * Mock mode is the default and always works offline. A live provider is used
 * only when the local server reports one is configured; any failure falls back
 * to mock so the seeded demonstration is never blocked.
 */
async function chooseProvider(): Promise<AiProvider> {
  try {
    const response = await fetch("/api/config", { cache: "no-store" });
    if (!response.ok) return new MockProvider();
    const config = (await response.json()) as {
      provider?: string;
      model?: string;
    };
    if (config.provider === "gemini") {
      return new GeminiProvider({
        apiKey: "server-side-proxy",
        model: config.model ?? "gemini-2.0-flash",
        timeoutMs: 30000,
        maxRetries: 2,
        endpoint: "/api/ai",
      });
    }
  } catch {
    /* opened from file:// or no server: use mock */
  }
  return new MockProvider();
}

async function bootstrap(): Promise<void> {
  const root = document.getElementById("root");
  if (!root) throw new Error("Root element is missing from the document.");

  const store = new Store(
    await chooseProvider(),
    new BrowserStorageRepository(),
  );
  const restored = await store.restore();
  if (!restored && !location.hash) location.hash = "#/overview";
  mountApp(root, store);
}

void bootstrap().catch((error: unknown) => {
  const root = document.getElementById("root");
  if (root) {
    root.textContent = `The application failed to start: ${error instanceof Error ? error.message : "unknown error"}`;
  }
});
