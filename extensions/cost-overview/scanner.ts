import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import type { CostEvent, CostOverviewCache, ScanResult, ScanStats } from "./types.ts";

const CACHE_VERSION = 2;

const getAgentDir = (): string => {
	const envDir = process.env.PI_CODING_AGENT_DIR;
	if (envDir?.startsWith("~/")) {
		return join(homedir(), envDir.slice(2));
	}
	return envDir || join(homedir(), ".pi", "agent");
};

const getCachePath = (): string => join(getAgentDir(), "cache", "cost-overview.json");

const resolveConfiguredPath = (path: string, baseDir = process.cwd()): string => {
	let expanded = path;
	if (expanded === "~") {
		expanded = homedir();
	} else if (expanded.startsWith("~/")) {
		expanded = join(homedir(), expanded.slice(2));
	}
	return isAbsolute(expanded) ? resolve(expanded) : resolve(baseDir, expanded);
};

const isInside = (child: string, parent: string): boolean => {
	const rel = relative(parent, child);
	return rel === "" || (rel.length > 0 && !rel.startsWith("..") && !isAbsolute(rel));
};

const reduceRoots = (roots: Iterable<string>): string[] => {
	const sorted = [...new Set([...roots].map((root) => resolve(root)))].sort((a, b) => a.length - b.length);
	const result: string[] = [];
	for (const root of sorted) {
		if (!result.some((existing) => isInside(root, existing))) {
			result.push(root.endsWith(sep) && root.length > 1 ? root.slice(0, -1) : root);
		}
	}
	return result;
};

const readSettingsSessionDir = async (settingsPath: string, baseDir: string): Promise<string | undefined> => {
	try {
		const raw = await readFile(settingsPath, "utf8");
		const parsed = JSON.parse(raw) as { sessionDir?: unknown };
		return typeof parsed.sessionDir === "string" && parsed.sessionDir.length > 0
			? resolveConfiguredPath(parsed.sessionDir, baseDir)
			: undefined;
	} catch {
		return undefined;
	}
};

const getCliSessionDir = (): string | undefined => {
	const args = process.argv.slice(2);
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i];
		if (arg === "--session-dir" && args[i + 1]) {
			return resolveConfiguredPath(args[i + 1]);
		}
		if (arg.startsWith("--session-dir=")) {
			return resolveConfiguredPath(arg.slice("--session-dir=".length));
		}
	}
	return undefined;
};

const emptyCache = (): CostOverviewCache => ({
	version: CACHE_VERSION,
	generatedAt: new Date().toISOString(),
	excludedCostProviders: [],
	files: {},
});

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

const toNumber = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

const toString = (value: unknown, fallback: string): string =>
	typeof value === "string" && value.length > 0 ? value : fallback;

const hash = (value: unknown): string =>
	createHash("sha256").update(JSON.stringify(value)).digest("hex");

const findSessionFiles = async (roots: string[]): Promise<string[]> => {
	const files = new Set<string>();

	const visit = async (dir: string): Promise<void> => {
		let entries;
		try {
			entries = await readdir(dir, { withFileTypes: true });
		} catch {
			return;
		}

		for (const entry of entries) {
			const path = join(dir, entry.name);
			if (entry.isDirectory()) {
				await visit(path);
			} else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
				files.add(resolve(path));
			}
		}
	};

	for (const root of reduceRoots(roots)) {
		await visit(root);
	}

	return [...files].sort();
};

const loadCache = async (cachePath: string): Promise<CostOverviewCache> => {
	try {
		const raw = await readFile(cachePath, "utf8");
		const parsed = JSON.parse(raw) as CostOverviewCache;
		if (parsed.version !== CACHE_VERSION || !isObject(parsed.files)) {
			return emptyCache();
		}
		return {
			...parsed,
			excludedCostProviders: Array.isArray(parsed.excludedCostProviders)
				? parsed.excludedCostProviders.filter((value): value is string => typeof value === "string")
				: [],
		};
	} catch {
		return emptyCache();
	}
};

const saveCache = async (cachePath: string, cache: CostOverviewCache): Promise<void> => {
	await mkdir(dirname(cachePath), { recursive: true });
	const tmpPath = `${cachePath}.${process.pid}.tmp`;
	await writeFile(tmpPath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
	await rename(tmpPath, cachePath);
};

export const saveExcludedCostProviders = async (providers: Iterable<string>): Promise<void> => {
	const cachePath = getCachePath();
	const cache = await loadCache(cachePath);
	cache.excludedCostProviders = [...new Set(providers)].sort();
	cache.generatedAt = new Date().toISOString();
	await saveCache(cachePath, cache);
};

const extractCostEvent = (entry: Record<string, unknown>, headerTimestamp?: string): CostEvent | undefined => {
	const message = entry.message;
	if (!isObject(message) || message.role !== "assistant") {
		return undefined;
	}

	const usage = message.usage;
	if (!isObject(usage)) {
		return undefined;
	}

	const usageCost = usage.cost;
	if (!isObject(usageCost)) {
		return undefined;
	}

	const cost = toNumber(usageCost.total);
	const input = toNumber(usage.input);
	const output = toNumber(usage.output);
	const cacheRead = toNumber(usage.cacheRead);
	const cacheWrite = toNumber(usage.cacheWrite);
	const timestamp = toString(entry.timestamp, headerTimestamp ?? new Date(0).toISOString());
	const provider = toString(message.provider, "unknown");
	const model = toString(message.model, "unknown");
	const responseId = typeof message.responseId === "string" ? message.responseId : undefined;
	const dedupeKey = responseId
		? `response:${provider}:${model}:${responseId}`
		: `fingerprint:${hash({
				provider,
				model,
				timestamp,
				messageTimestamp: message.timestamp,
				usage,
				entryId: entry.id,
				content: message.content,
			})}`;

	return {
		dedupeKey,
		timestamp,
		provider,
		model,
		cost,
		input,
		output,
		cacheRead,
		cacheWrite,
		totalTokens: toNumber(usage.totalTokens) || input + output + cacheRead + cacheWrite,
	};
};

const parseSessionFile = async (path: string): Promise<CostEvent[]> => {
	const raw = await readFile(path, "utf8");
	const events: CostEvent[] = [];
	let headerTimestamp: string | undefined;

	for (const line of raw.split("\n")) {
		if (!line.trim()) {
			continue;
		}

		let entry: unknown;
		try {
			entry = JSON.parse(line);
		} catch {
			continue;
		}

		if (!isObject(entry)) {
			continue;
		}

		if (entry.type === "session") {
			headerTimestamp = typeof entry.timestamp === "string" ? entry.timestamp : headerTimestamp;
			continue;
		}

		if (entry.type !== "message") {
			continue;
		}

		const event = extractCostEvent(entry, headerTimestamp);
		if (event) {
			events.push(event);
		}
	}

	return events;
};

const dedupeEvents = (events: CostEvent[]): CostEvent[] => {
	const seen = new Set<string>();
	const result: CostEvent[] = [];

	for (const event of events) {
		if (seen.has(event.dedupeKey)) {
			continue;
		}
		seen.add(event.dedupeKey);
		result.push(event);
	}

	return result;
};

const getSessionRoots = async (cwd: string | undefined, cache: CostOverviewCache): Promise<string[]> => {
	const agentDir = getAgentDir();
	const roots = new Set<string>([join(agentDir, "sessions")]);
	const cliSessionDir = getCliSessionDir();
	const envSessionDir = process.env.PI_CODING_AGENT_SESSION_DIR;
	const globalSettingsSessionDir = await readSettingsSessionDir(join(agentDir, "settings.json"), process.cwd());
	const processProjectSessionDir = await readSettingsSessionDir(join(process.cwd(), ".pi", "settings.json"), process.cwd());
	const contextProjectSessionDir = cwd
		? await readSettingsSessionDir(join(cwd, ".pi", "settings.json"), cwd)
		: undefined;

	for (const root of [
		cliSessionDir,
		envSessionDir ? resolveConfiguredPath(envSessionDir) : undefined,
		globalSettingsSessionDir,
		processProjectSessionDir,
		contextProjectSessionDir,
	]) {
		if (root) {
			roots.add(root);
		}
	}

	for (const cachedPath of Object.keys(cache.files)) {
		roots.add(dirname(cachedPath));
	}

	return reduceRoots(roots);
};

export const scanCosts = async (cwd?: string): Promise<ScanResult> => {
	const cachePath = getCachePath();
	const cache = await loadCache(cachePath);
	const sessionRoots = await getSessionRoots(cwd, cache);
	const sessionFiles = await findSessionFiles(sessionRoots);
	const currentFiles = new Set(sessionFiles);
	const allEvents: CostEvent[] = [];
	const stats: ScanStats = {
		totalFiles: sessionFiles.length,
		cacheHits: 0,
		parsedFiles: 0,
		failedFiles: 0,
		eventsBeforeDedupe: 0,
		eventsAfterDedupe: 0,
	};

	for (const cachedPath of Object.keys(cache.files)) {
		if (!currentFiles.has(cachedPath)) {
			delete cache.files[cachedPath];
		}
	}

	for (const path of sessionFiles) {
		try {
			const fileStat = await stat(path);
			const cached = cache.files[path];
			if (cached && cached.mtimeMs === fileStat.mtimeMs && cached.size === fileStat.size) {
				stats.cacheHits += 1;
				allEvents.push(...cached.events);
				continue;
			}

			const events = await parseSessionFile(path);
			stats.parsedFiles += 1;
			cache.files[path] = {
				mtimeMs: fileStat.mtimeMs,
				size: fileStat.size,
				events,
			};
			allEvents.push(...events);
		} catch {
			stats.failedFiles += 1;
		}
	}

	stats.eventsBeforeDedupe = allEvents.length;
	const events = dedupeEvents(allEvents);
	stats.eventsAfterDedupe = events.length;
	cache.generatedAt = new Date().toISOString();
	await saveCache(cachePath, cache);

	return { events, stats, cachePath, excludedCostProviders: cache.excludedCostProviders };
};
