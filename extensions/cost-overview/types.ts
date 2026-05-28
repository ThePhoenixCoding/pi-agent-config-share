export type UsageTotals = {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
};

export type CostEvent = UsageTotals & {
	dedupeKey: string;
	timestamp: string;
	provider: string;
	model: string;
	cost: number;
};

export type CachedSessionFile = {
	mtimeMs: number;
	size: number;
	events: CostEvent[];
};

export type CostOverviewCache = {
	version: 2;
	generatedAt: string;
	excludedCostProviders: string[];
	files: Record<string, CachedSessionFile>;
};

export type ScanStats = {
	totalFiles: number;
	cacheHits: number;
	parsedFiles: number;
	failedFiles: number;
	eventsBeforeDedupe: number;
	eventsAfterDedupe: number;
};

export type ScanResult = {
	events: CostEvent[];
	stats: ScanStats;
	cachePath: string;
	excludedCostProviders: string[];
};

export type PeriodKey = "today" | "last7Days" | "last30Days" | "last12Months";

export type CostTotals = Record<PeriodKey, number>;
export type TokenTotalsByPeriod = Record<PeriodKey, UsageTotals>;

export type AggregatedProvider = {
	provider: string;
	costs: CostTotals;
	tokens: TokenTotalsByPeriod;
};

export type AggregationResult = {
	providers: AggregatedProvider[];
	costTotal: CostTotals;
	tokenTotal: TokenTotalsByPeriod;
};
