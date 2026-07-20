import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { pathToFileURL } from "node:url";

const patchScript = new URL("./pi-context-bar-patch.mjs", import.meta.url);

async function patchedFooter() {
  const root = await mkdtemp(join(tmpdir(), "pi-context-bar-"));
  const footerPath = join(root, "dist/modes/interactive/components/footer.js");
  await mkdir(join(root, "dist/modes/interactive/components"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ name: "@earendil-works/pi-coding-agent", type: "module" }));
  await writeFile(footerPath, `export function formatCwdForFooter(cwd) { return cwd; }
export class FooterComponent {
    render() {
        const contextUsage = null;
        const state = { model: null };
        const contextWindow = contextUsage?.contextWindow ?? state.model?.contextWindow ?? 0;
        const contextPercentValue = contextUsage?.percent ?? 0;
        const contextPercent = contextUsage?.percent !== null ? contextPercentValue.toFixed(1) : "?";
        const statsParts = [];
        // Colorize context percentage based on usage
        let contextPercentStr;
        if (contextPercentValue > 90) contextPercentStr = contextPercent;
        else contextPercentStr = contextPercent;
        statsParts.push(contextPercentStr);
        return statsParts;
    }
}
`);

  const result = spawnSync(process.execPath, [patchScript.pathname], {
    encoding: "utf8",
    env: { ...process.env, PI_CODING_AGENT_PACKAGE_DIR: root, PI_BIN: "" },
  });
  assert.equal(result.status, 0, result.stderr);
  return import(`${pathToFileURL(footerPath).href}?test=${Date.now()}`);
}

function cells(bar) {
  return [...bar.matchAll(/\x1b\[48;2;(\d+);(\d+);(\d+)m\x1b\[38;2;(\d+);(\d+);(\d+)m(.)/g)].map((match) => ({
    background: match.slice(1, 4).map(Number),
    foreground: match.slice(4, 7).map(Number),
    char: match[7],
  }));
}

function backgrounds(bar) {
  return cells(bar).map((cell) => cell.background);
}

const EMPTY_BACKGROUND = [48, 48, 48];
const WHITE = [255, 255, 255];

test("filled cells form a rainbow from violet to red", async () => {
  const footer = await patchedFooter();
  const colors = backgrounds(footer.formatContextUsageBar(100, 200_000, false, 7));

  assert.deepEqual(colors[0], [148, 0, 211]);
  assert.deepEqual(colors.at(-1), [255, 0, 0]);
  assert.equal(new Set(colors.map(String)).size, colors.length);
});

test("the first interval is empty and red appears in the interval before 100 percent", async () => {
  const footer = await patchedFooter();

  assert.ok(backgrounds(footer.formatContextUsageBar(6.66, 200_000, false, 14)).every((color) => String(color) === String(EMPTY_BACKGROUND)));
  assert.equal(backgrounds(footer.formatContextUsageBar(6.67, 200_000, false, 14)).filter((color) => String(color) !== String(EMPTY_BACKGROUND)).length, 1);
  assert.deepEqual(backgrounds(footer.formatContextUsageBar(93.34, 200_000, false, 14)).at(-1), [255, 0, 0]);
});

test("the whole label is always white", async () => {
  const footer = await patchedFooter();

  for (const percent of [1, 19, 100]) {
    const labelCells = cells(footer.formatContextUsageBar(percent, 200_000, false, 14)).filter((cell) => cell.char !== " ");
    assert.ok(labelCells.every((cell) => String(cell.foreground) === String(WHITE)));
  }
});

test("usage outside the valid range is clamped", async () => {
  const footer = await patchedFooter();

  assert.ok(backgrounds(footer.formatContextUsageBar(-1, 200_000, false, 7)).every((color) => String(color) === String(EMPTY_BACKGROUND)));
  assert.deepEqual(backgrounds(footer.formatContextUsageBar(101, 200_000, false, 7)).at(-1), [255, 0, 0]);
});
