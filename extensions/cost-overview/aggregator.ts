import type {
	AggregatedProvider,
	AggregationResult,
	CostEvent,
	CostTotals,
	PeriodKey,
	TokenTotalsByPeriod,
	UsageTotals,
} from "./types.ts";

export const periodKeys: PeriodKey[] = ["today", "last7Days", "last30Days", "last12Months"];

const emptyCostTotals = (): CostTotals => ({
	today: 0,
	last7Days: 0,
	last30Days: 0,
	last12Months: 0,
});

const emptyUsageTotals = (): UsageTotals => ({
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0,
	totalTokens: 0,
});

const emptyTokenTotalsByPeriod = (): TokenTotalsByPeriod => ({
	today: emptyUsageTotals(),
	last7Days: emptyUsageTotals(),
	last30Days: emptyUsageTotals(),
	last12Months: emptyUsageTotals(),
});

const addUsage = (target: UsageTotals, event: CostEvent): void => {
	target.input += event.input;
	target.output += event.output;
	target.cacheRead += event.cacheRead;
	target.cacheWrite += event.cacheWrite;
	target.totalTokens += event.totalTokens || event.input + event.output + event.cacheRead + event.cacheWrite;
};

const startOfToday = (now: Date): Date => {
	const result = new Date(now);
	result.setHours(0, 0, 0, 0);
	return result;
};

const subtractDays = (now: Date, days: number): Date =>
	new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

const subtractMonths = (now: Date, months: number): Date => {
	const result = new Date(now);
	result.setMonth(result.getMonth() - months);
	return result;
};

export const aggregateCosts = (
	events: CostEvent[],
	excludedCostProviders = new Set<string>(),
	now = new Date(),
): AggregationResult => {
	const thresholds: Record<PeriodKey, Date> = {
		today: startOfToday(now),
		last7Days: subtractDays(now, 7),
		last30Days: subtractDays(now, 30),
		last12Months: subtractMonths(now, 12),
	};
	const providers = new Map<string, { costs: CostTotals; tokens: TokenTotalsByPeriod }>();
	const costTotal = emptyCostTotals();
	const tokenTotal = emptyTokenTotalsByPeriod();

	for (const event of events) {
		const timestamp = new Date(event.timestamp);
		if (Number.isNaN(timestamp.getTime())) {
			continue;
		}

		let providerTotals = providers.get(event.provider);
		if (!providerTotals) {
			providerTotals = { costs: emptyCostTotals(), tokens: emptyTokenTotalsByPeriod() };
			providers.set(event.provider, providerTotals);
		}

		for (const period of periodKeys) {
			if (timestamp >= thresholds[period] && timestamp <= now) {
				providerTotals.costs[period] += event.cost;
				addUsage(providerTotals.tokens[period], event);
				addUsage(tokenTotal[period], event);
				if (!excludedCostProviders.has(event.provider)) {
					costTotal[period] += event.cost;
				}
			}
		}
	}

	const providerRows: AggregatedProvider[] = [...providers.entries()]
		.map(([provider, totals]) => ({ provider, costs: totals.costs, tokens: totals.tokens }))
		.filter((row) => periodKeys.some((period) => row.costs[period] !== 0 || row.tokens[period].totalTokens !== 0))
		.sort((a, b) => {
			const byCost = b.costs.last12Months - a.costs.last12Months;
			return byCost !== 0 ? byCost : a.provider.localeCompare(b.provider);
		});

	return { providers: providerRows, costTotal, tokenTotal };
};
