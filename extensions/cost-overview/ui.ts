import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { aggregateCosts, periodKeys } from "./aggregator.ts";
import { saveExcludedCostProviders } from "./scanner.ts";
import type { AggregatedProvider, AggregationResult, CostTotals, PeriodKey, ScanResult, UsageTotals } from "./types.ts";

type View = { type: "costs" } | { type: "tokens"; period: PeriodKey };

const views: View[] = [
	{ type: "costs" },
	{ type: "tokens", period: "today" },
	{ type: "tokens", period: "last7Days" },
	{ type: "tokens", period: "last30Days" },
	{ type: "tokens", period: "last12Months" },
];

const periodLabels: Record<PeriodKey, string> = {
	today: "Today",
	last7Days: "7d",
	last30Days: "30d",
	last12Months: "12m",
};

const formatCurrency = (value: number): string => {
	const abs = Math.abs(value);
	if (abs === 0) {
		return "$0.00";
	}
	if (abs < 0.01) {
		return `$${value.toFixed(5)}`;
	}
	if (abs < 1) {
		return `$${value.toFixed(3)}`;
	}
	return `$${value.toFixed(2)}`;
};

const formatTokens = (value: number): string => Math.round(value).toLocaleString("en-US");
const padLeft = (value: string, width: number): string => value.padStart(width, " ");
const padRight = (value: string, width: number): string => value.padEnd(width, " ");

const costValues = (totals: CostTotals): string[] => periodKeys.map((period) => formatCurrency(totals[period]));
const tokenValues = (totals: UsageTotals): string[] => [
	formatTokens(totals.input),
	formatTokens(totals.output),
	formatTokens(totals.cacheRead),
	formatTokens(totals.cacheWrite),
	formatTokens(totals.totalTokens),
];

const formatTable = (rows: string[][]): string[] => {
	const widths = rows[0].map((_, index) => Math.max(...rows.map((row) => row[index].length)));
	const divider = widths.map((width) => "─".repeat(width)).join("─┼─");
	const formatRow = (row: string[]): string =>
		row
			.map((cell, index) => (index === 0 ? padRight(cell, widths[index]) : padLeft(cell, widths[index])))
			.join(" │ ");

	return [formatRow(rows[0]), divider, ...rows.slice(1, -1).map(formatRow), divider, formatRow(rows[rows.length - 1])];
};

const costRows = (aggregation: AggregationResult, excludedProviders: Set<string>): string[][] => {
	const headers = ["Provider", ...periodKeys.map((period) => periodLabels[period])];
	const rows = aggregation.providers.map((row) => [
		`${excludedProviders.has(row.provider) ? "○" : "●"} ${row.provider}`,
		...costValues(row.costs),
	]);
	return [headers, ...rows, ["Total", ...costValues(aggregation.costTotal)]];
};

const tokenRows = (aggregation: AggregationResult, period: PeriodKey): string[][] => {
	const headers = ["Provider", "input", "output", "cacheRead", "cacheWrite", "totalTokens"];
	const rows = aggregation.providers.map((row) => [row.provider, ...tokenValues(row.tokens[period])]);
	return [headers, ...rows, ["Total", ...tokenValues(aggregation.tokenTotal[period])]];
};

const providerIndexFromTableLine = (lineIndex: number): number => lineIndex - 2;

const buildPlainLines = (aggregation: AggregationResult, scan: ScanResult): string[] => [
	"Costs",
	...formatTable(costRows(aggregation, new Set(scan.excludedCostProviders))),
	"",
	...periodKeys.flatMap((period) => [
		`Tokens ${periodLabels[period]}`,
		...formatTable(tokenRows(aggregation, period)),
		"",
	]),
	`Files: ${scan.stats.totalFiles} total, ${scan.stats.cacheHits} cached, ${scan.stats.parsedFiles} parsed, ${scan.stats.failedFiles} failed`,
	`Events: ${scan.stats.eventsAfterDedupe} counted, ${scan.stats.eventsBeforeDedupe - scan.stats.eventsAfterDedupe} duplicates skipped`,
	`Cache: ${scan.cachePath}`,
];

export const showCostOverview = async (ctx: ExtensionCommandContext, scan: ScanResult): Promise<void> => {
	let excludedProviders = new Set(scan.excludedCostProviders);
	let viewIndex = 0;
	let selectedProviderIndex = 0;
	let aggregation = aggregateCosts(scan.events, excludedProviders);

	if (!ctx.hasUI) {
		console.log(buildPlainLines(aggregation, scan).join("\n"));
		return;
	}

	await ctx.ui.custom((tui, theme, _keybindings, done) => ({
		render: (width: number) => {
			aggregation = aggregateCosts(scan.events, excludedProviders);
			const providerCount = aggregation.providers.length;
			selectedProviderIndex = Math.max(0, Math.min(selectedProviderIndex, Math.max(0, providerCount - 1)));
			const view = views[viewIndex];
			const border = theme.fg("accent", "─".repeat(Math.max(1, Math.min(width, 100))));
			const title = view.type === "costs" ? "Cost overview" : `Token overview · ${periodLabels[view.period]}`;
			const subtitle =
				view.type === "costs"
					? "Tab/←/→ view · ↑/↓ provider · Space exclude/include from Total · Enter/Esc close"
					: "Tab/←/→ view · Enter/Esc close";
			const rows = view.type === "costs" ? costRows(aggregation, excludedProviders) : tokenRows(aggregation, view.period);
			const tableLines = formatTable(rows).map((line, index) => {
				const providerIndex = providerIndexFromTableLine(index);
				const provider = aggregation.providers[providerIndex];
				const selected = providerIndex === selectedProviderIndex && providerIndex >= 0;
				const dim = view.type === "costs" && provider && excludedProviders.has(provider.provider);
				const prefix = selected && provider ? theme.fg("accent", "› ") : "  ";
				const text = dim ? theme.fg("dim", line) : line;
				return prefix + text;
			});

			return [
				border,
				theme.fg("accent", theme.bold(title)),
				theme.fg("dim", subtitle),
				"",
				...tableLines,
				"",
				`Files: ${scan.stats.totalFiles} total, ${scan.stats.cacheHits} cached, ${scan.stats.parsedFiles} parsed, ${scan.stats.failedFiles} failed`,
				`Events: ${scan.stats.eventsAfterDedupe} counted, ${scan.stats.eventsBeforeDedupe - scan.stats.eventsAfterDedupe} duplicates skipped`,
				`Cache: ${scan.cachePath}`,
				border,
			].map((line) => truncateToWidth(line, width));
		},
		invalidate: () => {},
		handleInput: (data: string) => {
			if (matchesKey(data, "enter") || matchesKey(data, "escape")) {
				done(undefined);
				return;
			}
			if (matchesKey(data, "tab") || matchesKey(data, "right")) {
				viewIndex = (viewIndex + 1) % views.length;
				tui.requestRender();
				return;
			}
			if (matchesKey(data, "shift+tab") || matchesKey(data, "left")) {
				viewIndex = (viewIndex - 1 + views.length) % views.length;
				tui.requestRender();
				return;
			}
			if (matchesKey(data, "up")) {
				selectedProviderIndex = Math.max(0, selectedProviderIndex - 1);
				tui.requestRender();
				return;
			}
			if (matchesKey(data, "down")) {
				selectedProviderIndex = Math.min(Math.max(0, aggregation.providers.length - 1), selectedProviderIndex + 1);
				tui.requestRender();
				return;
			}
			if (views[viewIndex].type === "costs" && matchesKey(data, "space")) {
				const provider = aggregation.providers[selectedProviderIndex]?.provider;
				if (!provider) {
					return;
				}
				if (excludedProviders.has(provider)) {
					excludedProviders.delete(provider);
				} else {
					excludedProviders.add(provider);
				}
				saveExcludedCostProviders(excludedProviders).catch((error) => {
					const message = error instanceof Error ? error.message : String(error);
					ctx.ui.notify(`Could not save excluded providers: ${message}`, "error");
				});
				tui.requestRender();
			}
		},
	}));
};
