import { join } from "node:path";

export const WORKTREE_DIRECTORY_NAME = ".worktrees";
export const WORKTREE_EXCLUDE_LINE = "/.worktrees/";

const MAX_SLUG_LENGTH = 60;

export function slugifyWorktreeName(input) {
	const slug = input
		.normalize("NFKD")
		.replace(/\p{Diacritic}/gu, "")
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/[._-]+/g, "-")
		.replace(/^-+|-+$/g, "");

	return slug || "worktree";
}

export function generateWorktreeName(input, now = new Date()) {
	if (input.trim().length > 0) {
		const slug = slugifyWorktreeName(input);
		return slug.length > MAX_SLUG_LENGTH ? slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/, "") : slug;
	}

	const timestamp = now
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\.\d{3}Z$/, "")
		.replace("T", "-");
	return `worktree-${timestamp}`;
}

export function nextAvailableName(baseName, exists) {
	if (!exists(baseName)) return baseName;

	for (let suffix = 2; suffix < 10_000; suffix += 1) {
		const candidate = `${baseName}-${suffix}`;
		if (!exists(candidate)) return candidate;
	}

	throw new Error(`Could not find an available worktree name for ${baseName}`);
}

export function branchNameFor(name) {
	return `worktree/${name}`;
}

export function parseWorktreeList(output) {
	const worktrees = [];
	let current;

	for (const line of output.split("\n")) {
		if (line.startsWith("worktree ")) {
			current = { path: line.slice("worktree ".length) };
			worktrees.push(current);
			continue;
		}

		if (!current) continue;

		if (line === "bare") {
			worktrees.pop();
			current = undefined;
			continue;
		}

		if (line.startsWith("branch refs/heads/")) {
			current.branch = line.slice("branch refs/heads/".length);
		}
	}

	return worktrees;
}

export function removeFinalLineBreak(value) {
	return value.replace(/\r?\n$/, "");
}

export function appendLineIfMissing(current, line) {
	if (current.split("\n").some((existingLine) => existingLine.trim() === line)) return current;
	const prefix = current.length === 0 || current.endsWith("\n") ? "" : "\n";
	return `${current}${prefix}${line}\n`;
}

export function worktreePathFor(repositoryRoot, name) {
	return join(repositoryRoot, WORKTREE_DIRECTORY_NAME, name);
}

export function shellSingleQuote(value) {
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function buildPiLaunchCommand(launcherPath, worktreePath) {
	return `${shellSingleQuote(launcherPath)} ${shellSingleQuote(worktreePath)}`;
}

export function appleScriptString(value) {
	return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

export function buildIterm2SplitScript(launcherPath, worktreePath) {
	const launchPrefix = appleScriptString(`exec ${buildPiLaunchCommand(launcherPath, worktreePath)}`);
	return [
		'tell application "iTerm2"',
		"activate",
		"if (count of windows) = 0 then",
		"create window with default profile",
		"end if",
		"set oldSession to current session of current window",
		"set oldTty to tty of oldSession",
		`set commandText to ${launchPrefix} & " '" & oldTty & "'"`,
		"tell oldSession",
		"set newSession to (split vertically with default profile)",
		"end tell",
		"tell newSession",
		"write text commandText",
		"end tell",
		"end tell",
	].join("\n");
}
