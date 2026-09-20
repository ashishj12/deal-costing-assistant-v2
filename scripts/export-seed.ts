/**
 * Regenerates the human-readable seed/ folder from the code that defines it,
 * so the documented seed content can never drift from what the app ships.
 * Run: npm run seed:export
 */
import * as fs from "fs";
import * as path from "path";
import { SCENARIOS } from "../src/data/scenarios";
import { MockProvider } from "../src/ai/mock-provider";
import { Store } from "../src/ui/state";
import { InMemoryRepository } from "../src/data/repository";
import { renderPackageMarkdown } from "../src/export/markdown";
import {
  BASE_UNITS,
  BAND_UNCERTAINTY,
  DEFAULT_RATES,
  RATE_CARD_VERSION,
  ROLES,
} from "../src/engines/rates";

const root = path.join(__dirname, "..", "seed");
const write = (rel: string, body: string): void => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body.endsWith("\n") ? body : `${body}\n`);
};
const json = (v: unknown): string => JSON.stringify(v, null, 2);

async function main(): Promise<void> {
  const provider = new MockProvider();
  let structure = "";
  for (const scenario of SCENARIOS) {
    const model = scenario.build();
    const dir = `scenarios/${scenario.id}`;
    write(`${dir}/context.json`, json({
      id: scenario.id,
      title: scenario.title,
      shape: scenario.shape,
      summary: scenario.summary,
      customer: model.customer,
      configuration: model.configuration,
      sources: model.sources.map((s) => s.name),
    }));
    for (const source of model.sources) write(`${dir}/sources/${source.name}`, source.content);
    const recorded = await provider.extractRequirements({
      sources: model.sources.map((s) => ({ id: s.id, name: s.name, content: s.content })),
      customerName: model.customer.customerName,
      industry: model.customer.industry,
      objectives: model.customer.businessObjectives,
      existingRequirementIds: [],
    });
    write(`mock-responses/${scenario.id}.extraction.json`, json(recorded));

    if (!structure) {
      const store = new Store(provider, new InMemoryRepository());
      store.loadSeed(scenario.id);
      await store.extract();
      for (const q of store.state.model.questions) store.resolveQuestion(q.id, "Confirmed.");
      store.bulkSetStatus(store.state.model.requirements.map((r) => r.id), "approved");
      store.approveScope();
      await store.generateScope();
      await store.generateArchitecture(store.state.model.configuration.cloud ?? "recommend");
      await store.generateSolutionDesign();
      await store.generateWorkstreams();
      const md = renderPackageMarkdown(store.packageModel());
      structure = md.split("\n").filter((l) => l.startsWith("## ")).join("\n");
      write(`expected-output/${scenario.id}.package.md`, md);
    }
  }
  write("expected-document-structure.md", [
    "# Expected package document structure",
    "",
    "Every exported scoping package contains these top-level sections, in order,",
    "and always contains the mandatory disclaimer statement verbatim.",
    "Sections whose artifact has not been generated are listed as missing in the",
    "readiness list rather than fabricated.",
    "",
    structure,
  ].join("\n"));
  write("estimation/rate-card.json", json({
    rateCardVersion: RATE_CARD_VERSION,
    roles: ROLES,
    hourlyRatesByCurrency: DEFAULT_RATES,
    baseHoursByComplexityBand: BASE_UNITS,
    uncertaintyByComplexityBand: BAND_UNCERTAINTY,
  }));
  write("estimation/commercial-config.json", json({
    defaults: SCENARIOS[0]!.build().configuration,
    perScenario: Object.fromEntries(SCENARIOS.map((s) => [s.id, s.build().configuration])),
    formula: "ROM = sum(workstream hours x role mix x hourly rate) x (1 + contingency); effort range = adjusted hours +/- band uncertainty",
  }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
