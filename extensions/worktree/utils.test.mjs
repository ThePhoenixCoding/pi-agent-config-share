import assert from "node:assert/strict";
import { test } from "node:test";
import {
	appendLineIfMissing,
	appleScriptString,
	buildIterm2SplitScript,
	buildPiLaunchCommand,
	branchNameFor,
	generateWorktreeName,
	nextAvailableName,
	parseWorktreeList,
	removeFinalLineBreak,
	shellSingleQuote,
	slugifyWorktreeName,
	worktreePathFor,
} from "./utils.mjs";

test("slugifyWorktreeName creates a lower-case safe folder name", () => {
	assert.equal(slugifyWorktreeName("Fix REST API: OAuth Flow!"), "fix-rest-api-oauth-flow");
});

test("slugifyWorktreeName falls back for blank input", () => {
	assert.equal(slugifyWorktreeName("---"), "worktree");
});

test("slugifyWorktreeName transliterates diacritics to ASCII", () => {
	assert.equal(slugifyWorktreeName("über Fix für Renovate"), "uber-fix-fur-renovate");
});

test("slugifyWorktreeName falls back when only non-Latin characters remain", () => {
	assert.equal(slugifyWorktreeName("测试"), "worktree");
});

test("branchNameFor prefixes worktree namespace", () => {
	assert.equal(branchNameFor("fix-login"), "worktree/fix-login");
});

test("shellSingleQuote safely quotes paths with apostrophes", () => {
	assert.equal(shellSingleQuote("/tmp/it's fine"), "'/tmp/it'\\''s fine'");
});

test("buildPiLaunchCommand invokes the launcher script with the worktree path", () => {
	assert.equal(
		buildPiLaunchCommand("/opt/launcher.sh", "/tmp/it's fine"),
		"'/opt/launcher.sh' '/tmp/it'\\''s fine'",
	);
});

test("appleScriptString escapes AppleScript string content", () => {
	assert.equal(appleScriptString('say "hi"\\there'), '"say \\"hi\\"\\\\there"');
});

test("generateWorktreeName uses a readable timestamp when no description is given", () => {
	assert.equal(generateWorktreeName("", new Date("2026-05-27T09:08:07Z")), "worktree-20260527-090807");
});

test("generateWorktreeName uses the description when one is given", () => {
	assert.equal(generateWorktreeName("Fix OAuth callback!", new Date("2026-05-27T09:08:07Z")), "fix-oauth-callback");
});

test("generateWorktreeName preserves an explicit worktree description", () => {
	assert.equal(generateWorktreeName("worktree", new Date("2026-05-27T09:08:07Z")), "worktree");
});

test("generateWorktreeName caps very long descriptions at 60 characters", () => {
	const longInput = "this-is-a-very-long-description-that-exceeds-the-sixty-character-cap-by-far";
	const result = generateWorktreeName(longInput, new Date("2026-05-27T09:08:07Z"));

	assert.equal(result.length, 60);
	assert.equal(result, "this-is-a-very-long-description-that-exceeds-the-sixty-chara");
});

test("nextAvailableName returns the base name when it is available", () => {
	assert.equal(nextAvailableName("fix-oauth", () => false), "fix-oauth");
});

test("nextAvailableName appends a numeric suffix for existing worktrees", () => {
	const existingNames = new Set(["fix-oauth", "fix-oauth-2"]);

	assert.equal(nextAvailableName("fix-oauth", (name) => existingNames.has(name)), "fix-oauth-3");
});

test("nextAvailableName throws when no suffix is available", () => {
	assert.throws(() => nextAvailableName("fix-oauth", () => true), /Could not find/);
});

test("worktreePathFor places worktrees under the repository .worktrees directory", () => {
	assert.equal(worktreePathFor("/repo/project", "fix-oauth"), "/repo/project/.worktrees/fix-oauth");
});

test("buildIterm2SplitScript captures the old session's TTY and passes it as the second launcher argument", () => {
	assert.equal(
		buildIterm2SplitScript("/opt/launcher.sh", "/tmp/pi worktree"),
		[
			'tell application "iTerm2"',
			"activate",
			"if (count of windows) = 0 then",
			"create window with default profile",
			"end if",
			"set oldSession to current session of current window",
			"set oldTty to tty of oldSession",
			`set commandText to "'/opt/launcher.sh' '/tmp/pi worktree'" & " '" & oldTty & "'"`,
			"tell oldSession",
			"split vertically with default profile command commandText",
			"end tell",
			"end tell",
		].join("\n"),
	);
});

test("parseWorktreeList returns an empty list for empty input", () => {
	assert.deepEqual(parseWorktreeList(""), []);
});

test("parseWorktreeList ignores bare repository entries", () => {
	assert.deepEqual(
		parseWorktreeList(
			[
				"worktree /repo/bare.git",
				"bare",
				"",
				"worktree /repo/.worktrees/fix",
				"HEAD def456",
				"branch refs/heads/feature",
			].join("\n"),
		),
		[{ path: "/repo/.worktrees/fix", branch: "feature" }],
	);
});

test("parseWorktreeList parses multiple worktrees and detached heads", () => {
	assert.deepEqual(
		parseWorktreeList(
			[
				"worktree /repo/main",
				"HEAD abc123",
				"branch refs/heads/main",
				"",
				"worktree /repo/.worktrees/fix",
				"HEAD def456",
				"detached",
			].join("\n"),
		),
		[
			{ path: "/repo/main", branch: "main" },
			{ path: "/repo/.worktrees/fix" },
		],
	);
});

test("removeFinalLineBreak keeps meaningful surrounding spaces", () => {
	assert.equal(removeFinalLineBreak(" /repo/with spaces \n"), " /repo/with spaces ");
});

test("appendLineIfMissing appends with a separator when needed", () => {
	assert.equal(appendLineIfMissing("*.log", ".worktrees/"), "*.log\n.worktrees/\n");
});

test("appendLineIfMissing does not duplicate an existing line", () => {
	assert.equal(appendLineIfMissing("*.log\n.worktrees/\n", ".worktrees/"), "*.log\n.worktrees/\n");
});

test("appendLineIfMissing handles empty input without a leading newline", () => {
	assert.equal(appendLineIfMissing("", ".worktrees/"), ".worktrees/\n");
});

test("appendLineIfMissing reuses an existing trailing newline as separator", () => {
	assert.equal(appendLineIfMissing("*.log\n", ".worktrees/"), "*.log\n.worktrees/\n");
});
