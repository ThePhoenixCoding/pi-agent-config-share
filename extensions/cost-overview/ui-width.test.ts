import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { showCostOverview } from "./ui.ts";
import type { CostEvent, ScanResult } from "./types.ts";

const now = new Date();
const event = (provider: string, cost: number): CostEvent => ({
	dedupeKey: provider,
	timestamp: now.toISOString(),
	provider,
	model: "model",
	cost,
	input: 1000,
	output: 2000,
	cacheRead: 3000,
	cacheWrite: 4000,
	totalTokens: 10000,
});

const scan: ScanResult = {
	events: [
		event("openai-codex", 77.11),
		event("anthropic", 0),
		event("google", 0.095),
		event("claude-bridge", 0),
	],
	stats: {
		totalFiles: 851,
		cacheHits: 850,
		parsedFiles: 1,
		failedFiles: 0,
		eventsBeforeDedupe: 27125,
		eventsAfterDedupe: 27123,
	},
	cachePath: "/Users/beruflich/.pi/agent/cache/cost-overview.json",
	excludedCostProviders: [],
};

let renderedLines: string[] = [];
const ctx = {
	hasUI: true,
	ui: {
		custom: async (factory: any) => {
			const component = factory(
				{ requestRender() {} },
				{ fg: (_name: string, text: string) => text, bold: (text: string) => text },
				{},
				() => {},
			);
			renderedLines = component.render(77);
		},
		notify() {},
	},
};

const main = async () => {
	await showCostOverview(ctx as any, scan);

	const tooWide = renderedLines
		.map((line, index) => ({ index, width: visibleWidth(line), line }))
		.filter(({ width }) => width > 77);

	assert.deepEqual(tooWide, []);
};

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
