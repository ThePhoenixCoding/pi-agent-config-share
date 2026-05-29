import { spawn } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { complete } from "@earendil-works/pi-ai";
import type { ExecResult, ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	WORKTREE_DIRECTORY_NAME,
	WORKTREE_EXCLUDE_LINE,
	appendLineIfMissing,
	branchNameFor,
	buildIterm2SplitScript,
	generateWorktreeName,
	nextAvailableName,
	parseWorktreeList,
	removeFinalLineBreak,
	shellSingleQuote,
	worktreePathFor,
} from "./utils.mjs";

const LAUNCHER_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "launch.sh");

export default function (pi: ExtensionAPI) {
	pi.registerCommand("worktree", {
		description: "Create a generated git worktree, or close the current one with /worktree close",
		handler: async (args, ctx) => {
			await ctx.waitForIdle();
			const closesWorktree = args.trim() === "close";
			ctx.ui.setStatus("worktree", closesWorktree ? "closing worktree..." : "creating worktree...");

			try {
				if (closesWorktree) {
					const result = await closeWorktree(pi, ctx);
					ctx.ui.notify(result.message, "info");
					if (result.closed) {
						try {
							scheduleItermPaneClose(result.tty);
						} finally {
							ctx.shutdown();
						}
					}
					return;
				}

				const result = await createAndOpenWorktree(pi, ctx, args);
				ctx.ui.notify(`Opened ${result.name} (${result.branch})`, "info");
				ctx.shutdown();
			} catch (error) {
				ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
			} finally {
				ctx.ui.setStatus("worktree", undefined);
			}
		},
	});
}

async function createAndOpenWorktree(pi: ExtensionAPI, ctx: ExtensionCommandContext, args: string) {
	if (process.platform !== "darwin") {
		throw new Error("/worktree iTerm2 integration requires macOS.");
	}
	if (process.env.TERM_PROGRAM !== "iTerm.app") {
		throw new Error(
			`/worktree requires pi to be running inside iTerm2 (got TERM_PROGRAM='${process.env.TERM_PROGRAM ?? ""}'). ` +
				`Auto-closing the old pane would otherwise affect an unrelated iTerm2 session.`,
		);
	}

	const currentRoot = await gitOutput(pi, ["rev-parse", "--show-toplevel"], ctx.cwd);
	const worktrees = parseWorktreeList(await gitOutput(pi, ["worktree", "list", "--porcelain"], currentRoot));
	const repositoryRoot = worktrees[0]?.path ?? currentRoot;
	const worktreeRoot = resolve(repositoryRoot, WORKTREE_DIRECTORY_NAME);
	const branches = new Set(
		(await gitOutput(pi, ["for-each-ref", "--format=%(refname:short)", "refs/heads"], currentRoot))
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean),
	);
	const existingWorktreePaths = new Set(worktrees.map((worktree) => resolve(worktree.path)));
	const existingDirectories = await readDirectoryNames(worktreeRoot);
	const baseName = generateWorktreeName(args);
	const name = nextAvailableName(baseName, (candidate) => {
		return (
			branches.has(branchNameFor(candidate)) ||
			existingDirectories.has(candidate) ||
			existingWorktreePaths.has(resolve(worktreePathFor(repositoryRoot, candidate)))
		);
	});
	const branch = branchNameFor(name);
	const worktreePath = worktreePathFor(repositoryRoot, name);

	await ensureWorktreeRootIgnored(pi, repositoryRoot);
	await mkdir(worktreeRoot, { recursive: true });

	await runGit(pi, ["worktree", "add", "-b", branch, worktreePath, "HEAD"], currentRoot, 120_000);

	try {
		await openItermSplit(pi, ctx.cwd, worktreePath);
	} catch (error) {
		const quotedPath = shellSingleQuote(worktreePath);
		const quotedBranch = shellSingleQuote(branch);
		throw new Error(
			`${formatError(error)} Worktree ${quotedPath} (branch ${quotedBranch}) was created and left in place; ` +
				`run \`pi\` there manually or remove with \`git worktree remove --force ${quotedPath} && git branch -D ${quotedBranch}\`.`,
			{ cause: error },
		);
	}

	return { name, branch, worktreePath };
}

type CloseWorktreeResult = {
	closed: boolean;
	message: string;
	tty?: string;
};

async function closeWorktree(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<CloseWorktreeResult> {
	const currentRoot = await gitOutput(pi, ["rev-parse", "--show-toplevel"], ctx.cwd);
	const worktrees = parseWorktreeList(await gitOutput(pi, ["worktree", "list", "--porcelain"], currentRoot));
	const currentWorktree = worktrees.find((worktree) => resolve(worktree.path) === resolve(currentRoot));
	const mainWorktree = worktrees.find((worktree) => worktree.branch === "main");

	if (!mainWorktree) {
		throw new Error("Could not find a checked-out main worktree.");
	}
	if (!currentWorktree || resolve(currentWorktree.path) === resolve(mainWorktree.path)) {
		throw new Error("/worktree close must be run from a generated worktree, not from main.");
	}
	if (!currentWorktree.branch) {
		throw new Error("/worktree close requires the current worktree to be on a branch.");
	}
	if (!currentWorktree.branch.startsWith("worktree/")) {
		throw new Error(`Refusing to close non-worktree branch ${currentWorktree.branch}.`);
	}

	const repositoryRoot = mainWorktree.path;
	const worktreeRoot = resolve(repositoryRoot, WORKTREE_DIRECTORY_NAME);
	if (!isPathInside(worktreeRoot, currentRoot)) {
		throw new Error(`Refusing to close worktree outside ${worktreeRoot}.`);
	}

	const tty = await currentItermTty();
	await handleDirtyWorktree(pi, ctx, currentRoot);
	const commits = await commitsNotOnMain(pi, currentRoot);
	const action = commits.length === 0 ? "discard" : await askCloseAction(ctx, commits);
	if (!action) {
		return { closed: false, message: "Cancelled /worktree close." };
	}

	if (action === "merge") {
		await ensureMainWorktreeClean(pi, mainWorktree.path);
		await runGit(pi, ["merge", "--no-ff", "--no-edit", currentWorktree.branch], mainWorktree.path, 120_000);
	}

	await runGit(pi, ["worktree", "remove", "--force", currentRoot], repositoryRoot, 120_000);
	await runGit(pi, ["branch", "-D", currentWorktree.branch], repositoryRoot, 30_000);
	await removeWorktreeRootIfLast(pi, repositoryRoot, worktreeRoot);

	const commitCount = formatCommitCount(commits.length);
	const message = action === "merge" ? `Merged ${commitCount} into main and closed worktree.` : "Closed worktree.";
	return { closed: true, message, tty };
}

async function handleDirtyWorktree(pi: ExtensionAPI, ctx: ExtensionCommandContext, currentRoot: string): Promise<void> {
	const status = await gitOutput(pi, ["status", "--porcelain"], currentRoot);
	if (status.trim().length === 0) return;
	if (!ctx.hasUI) {
		throw new Error("Current worktree has uncommitted changes; /worktree close needs interactive UI to ask what to do.");
	}

	const choice = await ctx.ui.select("This worktree has uncommitted changes. What should happen?", [
		"Abort",
		"Commit uncommitted changes",
		"Discard uncommitted changes",
	]);
	if (choice === "Commit uncommitted changes") {
		await runGit(pi, ["add", "--all"], currentRoot, 30_000);
		const message = await generateCommitMessage(pi, ctx, currentRoot);
		await commitUncommittedChanges(pi, ctx, currentRoot, message);
		return;
	}
	if (choice !== "Discard uncommitted changes") {
		throw new Error("Cancelled /worktree close because the worktree has uncommitted changes.");
	}

	await runGit(pi, ["reset", "--hard"], currentRoot, 30_000);
	await runGit(pi, ["clean", "-fd"], currentRoot, 30_000);
}

async function commitUncommittedChanges(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	currentRoot: string,
	message: string,
): Promise<void> {
	try {
		await runGit(pi, ["commit", "-m", message], currentRoot, 120_000);
		return;
	} catch (error) {
		const choice = await ctx.ui.select(
			[
				"git commit failed, most likely because a hook failed.",
				"If clean verify has already run successfully for these exact staged changes, you may retry with --no-verify.",
				"What should happen?",
			].join("\n"),
			["Abort", "Retry commit with --no-verify"],
		);
		if (choice !== "Retry commit with --no-verify") {
			throw error;
		}
		await runGit(pi, ["commit", "--no-verify", "-m", message], currentRoot, 120_000);
	}
}

async function generateCommitMessage(
	pi: ExtensionAPI,
	ctx: ExtensionCommandContext,
	currentRoot: string,
): Promise<string> {
	if (!ctx.model) {
		throw new Error("Cannot generate a commit message because no model is selected.");
	}

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (!auth.ok) {
		throw new Error(`Cannot generate a commit message: ${auth.error}`);
	}
	if (!auth.apiKey) {
		throw new Error(`Cannot generate a commit message because no API key is configured for ${ctx.model.provider}.`);
	}

	const status = await gitOutput(pi, ["status", "--porcelain"], currentRoot);
	const diffStat = await gitOutput(pi, ["diff", "--cached", "--stat"], currentRoot);
	const diff = await gitOutput(pi, ["diff", "--cached", "--no-ext-diff"], currentRoot);
	const maxDiffLength = 20_000;
	const visibleDiff = diff.length > maxDiffLength ? `${diff.slice(0, maxDiffLength)}\n\n[diff truncated]` : diff;
	const response = await complete(
		ctx.model,
		{
			systemPrompt:
				"Generate a concise Git commit subject for staged changes. Output exactly one line, no quotes, no markdown, no prefix. Use imperative mood. Keep it under 72 characters.",
			messages: [
				{
					role: "user" as const,
					content: [
						{
							type: "text" as const,
							text: [`Git status:\n${status}`, `Diff stat:\n${diffStat}`, `Diff:\n${visibleDiff}`].join("\n\n"),
						},
					],
					timestamp: Date.now(),
				},
			],
		},
		{ apiKey: auth.apiKey, headers: auth.headers, maxTokens: 64, signal: ctx.signal },
	);
	const generated = response.content
		.filter((content): content is { type: "text"; text: string } => content.type === "text")
		.map((content) => content.text)
		.join("\n");
	const message = normalizeGeneratedCommitMessage(generated);
	if (!message) {
		throw new Error("Generated commit message was empty.");
	}

	return message;
}

async function commitsNotOnMain(pi: ExtensionAPI, currentRoot: string): Promise<string[]> {
	const output = await gitOutput(pi, ["log", "--format=%h %s", "main..HEAD"], currentRoot);
	return output
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
}

async function askCloseAction(ctx: ExtensionCommandContext, commits: string[]): Promise<"merge" | "discard" | undefined> {
	if (!ctx.hasUI) {
		throw new Error("Current worktree has commits not on main; /worktree close needs interactive UI to ask what to do.");
	}

	const visibleCommits = commits.slice(0, 25).map((commit) => `  ${commit}`);
	const hiddenCount = commits.length - visibleCommits.length;
	const hiddenLine = hiddenCount > 0 ? `  … and ${hiddenCount} more` : "";
	const choice = await ctx.ui.select(
		[
			`This worktree has ${formatCommitCount(commits.length)} not on main:`,
			visibleCommits.join("\n"),
			hiddenLine,
			"",
			"What should happen?",
		]
			.filter((line) => line.length > 0)
			.join("\n"),
		["Merge into main", "Discard worktree changes"],
	);

	if (choice === "Merge into main") return "merge";
	if (choice === "Discard worktree changes") return "discard";
	return undefined;
}

async function ensureMainWorktreeClean(pi: ExtensionAPI, mainWorktreePath: string): Promise<void> {
	const status = await gitOutput(pi, ["status", "--porcelain"], mainWorktreePath);
	if (status.trim().length === 0) return;
	throw new Error("Cannot merge because the main worktree has uncommitted changes.");
}

async function removeWorktreeRootIfLast(pi: ExtensionAPI, repositoryRoot: string, worktreeRoot: string): Promise<void> {
	const worktrees = parseWorktreeList(await gitOutput(pi, ["worktree", "list", "--porcelain"], repositoryRoot));
	const remainingGeneratedWorktree = worktrees.some((worktree) => isPathInside(worktreeRoot, worktree.path));
	if (remainingGeneratedWorktree) return;
	await rm(worktreeRoot, { recursive: true, force: true });
}

async function currentItermTty(): Promise<string | undefined> {
	if (process.platform !== "darwin" || process.env.TERM_PROGRAM !== "iTerm.app" || !process.stdin.isTTY) {
		return undefined;
	}

	return new Promise((resolveTty) => {
		const child = spawn("/usr/bin/tty", [], { stdio: ["inherit", "pipe", "ignore"] });
		let stdout = "";
		child.stdout.setEncoding("utf8");
		child.stdout.on("data", (chunk) => {
			stdout += chunk;
		});
		child.on("error", () => resolveTty(undefined));
		child.on("close", (code) => {
			if (code !== 0) {
				resolveTty(undefined);
				return;
			}

			const tty = removeFinalLineBreak(stdout).trim();
			resolveTty(tty.startsWith("/dev/") ? tty : undefined);
		});
	});
}

function scheduleItermPaneClose(tty: string | undefined): void {
	if (!tty) return;

	const script = `${buildItermPaneCloseScript(tty)}`;
	const child = spawn("/bin/zsh", ["-lc", script], { cwd: "/", detached: true, stdio: "ignore" });
	child.unref();
}

function buildItermPaneCloseScript(tty: string): string {
	return [
		"sleep 0.5",
		`osascript - ${shellSingleQuote(tty)} <<'APPLESCRIPT'`,
		"on run argv",
		"\tset targetTty to item 1 of argv",
		"\ttell application \"iTerm2\"",
		"\t\tset sessionCount to 0",
		"\t\trepeat with w in windows",
		"\t\t\trepeat with t in tabs of w",
		"\t\t\t\tset sessionCount to sessionCount + (count of sessions of t)",
		"\t\t\tend repeat",
		"\t\tend repeat",
		"\t\tif sessionCount <= 1 then return",
		"\t\trepeat with w in windows",
		"\t\t\trepeat with t in tabs of w",
		"\t\t\t\trepeat with s in sessions of t",
		"\t\t\t\t\tif tty of s is equal to targetTty then",
		"\t\t\t\t\t\tclose s",
		"\t\t\t\t\t\treturn",
		"\t\t\t\t\tend if",
		"\t\t\t\tend repeat",
		"\t\t\tend repeat",
		"\t\tend repeat",
		"\tend tell",
		"end run",
		"APPLESCRIPT",
	].join("\n");
}

function isPathInside(parent: string, child: string): boolean {
	const path = relative(resolve(parent), resolve(child));
	return path.length > 0 && !path.startsWith("..") && !isAbsolute(path);
}

function formatCommitCount(count: number): string {
	return `${count} commit${count === 1 ? "" : "s"}`;
}

async function readDirectoryNames(path: string): Promise<Set<string>> {
	try {
		return new Set(await readdir(path));
	} catch (error) {
		if (isNodeErrorCode(error, "ENOENT")) return new Set();
		throw error;
	}
}

async function ensureWorktreeRootIgnored(pi: ExtensionAPI, cwd: string): Promise<void> {
	const commonGitDir = await gitOutput(pi, ["rev-parse", "--git-common-dir"], cwd);
	const absoluteCommonGitDir = isAbsolute(commonGitDir) ? commonGitDir : resolve(cwd, commonGitDir);
	const excludePath = resolve(absoluteCommonGitDir, "info", "exclude");
	await mkdir(dirname(excludePath), { recursive: true });

	let current = "";
	try {
		current = await readFile(excludePath, "utf8");
	} catch (error) {
		if (!isNodeErrorCode(error, "ENOENT")) throw error;
	}

	const next = appendLineIfMissing(current, WORKTREE_EXCLUDE_LINE);
	if (next === current) return;
	await writeFile(excludePath, next, "utf8");
}

async function openItermSplit(pi: ExtensionAPI, cwd: string, worktreePath: string): Promise<void> {
	const script = buildIterm2SplitScript(LAUNCHER_PATH, worktreePath);
	await runCommand(pi, "osascript", ["-e", script], cwd, 15_000);
}

async function gitOutput(pi: ExtensionAPI, args: string[], cwd: string): Promise<string> {
	const result = await runGit(pi, args, cwd, 30_000);
	return removeFinalLineBreak(result.stdout);
}

async function runGit(pi: ExtensionAPI, args: string[], cwd: string, timeout: number): Promise<ExecResult> {
	return runCommand(pi, "git", args, cwd, timeout);
}

async function runCommand(
	pi: ExtensionAPI,
	command: string,
	args: string[],
	cwd: string,
	timeout: number,
): Promise<ExecResult> {
	const result = await pi.exec(command, args, { cwd, timeout });
	if (result.code === 0) return result;

	const output = [result.stderr, result.stdout].map((part) => part.trim()).filter(Boolean).join("\n");
	throw new Error(`${basename(command)} failed (exit ${result.code})${output ? `: ${output}` : ""}`);
}

function formatError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function normalizeGeneratedCommitMessage(value: string): string | undefined {
	const line = value
		.split("\n")
		.map((candidate) => candidate.trim())
		.filter((candidate) => candidate.length > 0 && !candidate.startsWith("```"))[0];
	const subject = line
		?.replace(/^[-*]\s+/, "")
		.replace(/^commit message:\s*/i, "")
		.replace(/^["'`]|["'`]$/g, "")
		.trim();
	if (!subject) return undefined;
	if (subject.length <= 72) return subject;

	return subject.slice(0, 72).replace(/\s+\S*$/, "").trim() || subject.slice(0, 72).trim();
}

function isNodeErrorCode(error: unknown, code: string): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
