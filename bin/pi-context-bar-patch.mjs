#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync, copyFileSync, chmodSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const packageName = "@earendil-works/pi-coding-agent";

function info(message) {
  console.error(`pi context bar patch: ${message}`);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function commandOutput(command, args) {
  try {
    return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

function pathExists(path) {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

function resolvePackageRootFromPiBin(piBin) {
  if (!piBin || !pathExists(piBin)) return null;
  let realBin;
  try {
    realBin = realpathSync(piBin);
  } catch {
    return null;
  }
  if (realBin.endsWith("/dist/cli.js")) return dirname(dirname(realBin));
  let current = dirname(realBin);
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(current, "package.json"))) {
      try {
        const pkg = JSON.parse(readFileSync(join(current, "package.json"), "utf8"));
        if (pkg.name === packageName) return current;
      } catch {}
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function candidatePackageRoots() {
  const roots = [];
  if (process.env.PI_CODING_AGENT_PACKAGE_DIR) roots.push(resolve(process.env.PI_CODING_AGENT_PACKAGE_DIR));
  roots.push(resolvePackageRootFromPiBin(process.env.PI_BIN));
  const piFromPath = commandOutput("/usr/bin/env", ["bash", "-lc", "command -v pi"]);
  roots.push(resolvePackageRootFromPiBin(piFromPath));
  const npmRoot = commandOutput("/usr/bin/env", ["npm", "root", "-g"]);
  if (npmRoot) roots.push(join(npmRoot, packageName));
  roots.push("/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent");
  roots.push("/usr/local/lib/node_modules/@earendil-works/pi-coding-agent");
  return unique(roots).filter((root) => root && pathExists(join(root, "package.json")));
}

function findFooterFileIn(root) {
  const direct = join(root, "dist/modes/interactive/components/footer.js");
  if (pathExists(direct)) return direct;
  const dist = join(root, "dist");
  if (!pathExists(dist)) return null;
  const queue = [dist];
  while (queue.length > 0) {
    const dir = queue.shift();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile() && entry.name === "footer.js") {
        const source = readFileSync(fullPath, "utf8");
        if (source.includes("FooterComponent") && source.includes("getContextUsage")) return fullPath;
      }
    }
  }
  return null;
}

function findFooterFile() {
  for (const root of candidatePackageRoots()) {
    const footer = findFooterFileIn(root);
    if (footer) return footer;
  }
  return null;
}

const helperSource = `const CONTEXT_USAGE_BAR_WIDTH = 14;
const CONTEXT_USAGE_GRADIENT_STOPS = [
    { percent: 0, rgb: { r: 0, g: 102, b: 255 } },
    { percent: 15, rgb: { r: 0, g: 200, b: 0 } },
    { percent: 25, rgb: { r: 255, g: 220, b: 0 } },
    { percent: 40, rgb: { r: 255, g: 0, b: 0 } },
];
const CONTEXT_USAGE_EMPTY_BG = { r: 48, g: 48, b: 48 };
const CONTEXT_USAGE_EMPTY_FG = { r: 150, g: 150, b: 150 };
const CONTEXT_USAGE_LIGHT_FG = { r: 255, g: 255, b: 255 };
const CONTEXT_USAGE_DARK_FG = { r: 0, g: 0, b: 0 };
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
function formatContextTokens(count) {
    if (count < 1000)
        return count.toString();
    if (count < 10000)
        return \`\${(count / 1000).toFixed(1)}k\`;
    if (count < 1000000)
        return \`\${Math.round(count / 1000)}k\`;
    if (count < 10000000)
        return \`\${(count / 1000000).toFixed(1)}M\`;
    return \`\${Math.round(count / 1000000)}M\`;
}
function interpolateChannel(start, end, progress) {
    return Math.round(start + (end - start) * progress);
}
function interpolateRgb(start, end, progress) {
    return {
        r: interpolateChannel(start.r, end.r, progress),
        g: interpolateChannel(start.g, end.g, progress),
        b: interpolateChannel(start.b, end.b, progress),
    };
}
export function getContextUsageGradientRgb(percent) {
    const clampedPercent = clamp(percent, CONTEXT_USAGE_GRADIENT_STOPS[0].percent, CONTEXT_USAGE_GRADIENT_STOPS[CONTEXT_USAGE_GRADIENT_STOPS.length - 1].percent);
    for (let i = 1; i < CONTEXT_USAGE_GRADIENT_STOPS.length; i++) {
        const previous = CONTEXT_USAGE_GRADIENT_STOPS[i - 1];
        const next = CONTEXT_USAGE_GRADIENT_STOPS[i];
        if (clampedPercent <= next.percent) {
            const span = next.percent - previous.percent;
            const progress = span === 0 ? 0 : (clampedPercent - previous.percent) / span;
            return interpolateRgb(previous.rgb, next.rgb, progress);
        }
    }
    return CONTEXT_USAGE_GRADIENT_STOPS[CONTEXT_USAGE_GRADIENT_STOPS.length - 1].rgb;
}
function bgRgb(rgb) {
    return \`\\x1b[48;2;\${rgb.r};\${rgb.g};\${rgb.b}m\`;
}
function fgRgb(rgb) {
    return \`\\x1b[38;2;\${rgb.r};\${rgb.g};\${rgb.b}m\`;
}
function contrastFgForBg(rgb) {
    const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
    return luminance > 0.55 ? CONTEXT_USAGE_DARK_FG : CONTEXT_USAGE_LIGHT_FG;
}
function colorCell(char, bg, fg) {
    return \`\${bgRgb(bg)}\${fgRgb(fg)}\${char}\\x1b[39m\\x1b[49m\`;
}
export function formatContextUsageBar(percent, contextWindow, autoCompactEnabled, barWidth = CONTEXT_USAGE_BAR_WIDTH) {
    const width = Math.max(4, Math.floor(barWidth));
    const percentIsKnown = typeof percent === "number" && Number.isFinite(percent);
    const clampedPercent = percentIsKnown ? clamp(percent, 0, 100) : 0;
    const label = percentIsKnown ? \`\${Math.round(clampedPercent)}%\` : "?";
    const fillColor = percentIsKnown ? getContextUsageGradientRgb(clampedPercent) : CONTEXT_USAGE_EMPTY_FG;
    const filledCells = percentIsKnown ? Math.round((clampedPercent / 100) * width) : 0;
    const labelStart = Math.max(0, Math.floor((width - label.length) / 2));
    const labelChars = new Map(Array.from(label, (char, index) => [labelStart + index, char]));
    let bar = "[";
    for (let i = 0; i < width; i++) {
        const filled = i < filledCells;
        const char = labelChars.get(i) ?? " ";
        const bg = filled ? fillColor : CONTEXT_USAGE_EMPTY_BG;
        const fg = labelChars.has(i)
            ? filled
                ? contrastFgForBg(fillColor)
                : fillColor
            : filled
                ? fillColor
                : CONTEXT_USAGE_EMPTY_FG;
        bar += colorCell(char, bg, fg);
    }
    bar += "]";
    const autoIndicator = autoCompactEnabled ? " (auto)" : "";
    return \`\${bar} \${formatContextTokens(contextWindow)}\${autoIndicator}\`;
}
`;

function insertHelper(source) {
  if (source.includes("export function formatContextUsageBar") && source.includes("export function getContextUsageGradientRgb")) return source;
  const anchors = ["export function formatCwdForFooter", "export class FooterComponent"];
  for (const anchor of anchors) {
    const index = source.indexOf(anchor);
    if (index !== -1) return `${source.slice(0, index)}${helperSource}${source.slice(index)}`;
  }
  throw new Error("footer helpers could not be inserted because no stable anchor was found");
}

function patchContextPercentCalculation(source) {
  if (source.includes("const rawContextPercent = contextUsage?.percent;") && source.includes("const contextPercentValue = rawContextPercent === null ? null : rawContextPercent ?? 0;")) return source;
  const pattern = /        const contextWindow = contextUsage\?\.contextWindow \?\? state\.model\?\.contextWindow \?\? 0;\n        const contextPercentValue = contextUsage\?\.percent \?\? 0;\n        const contextPercent = contextUsage\?\.percent !== null \? contextPercentValue\.toFixed\(1\) : "\?";/;
  const replacement = `        const contextWindow = contextUsage?.contextWindow ?? state.model?.contextWindow ?? 0;
        const rawContextPercent = contextUsage?.percent;
        const contextPercentValue = rawContextPercent === null ? null : rawContextPercent ?? 0;`;
  if (pattern.test(source)) return source.replace(pattern, replacement);
  const contextWindowLine = "        const contextWindow = contextUsage?.contextWindow ?? state.model?.contextWindow ?? 0;";
  const index = source.indexOf(contextWindowLine);
  if (index === -1) throw new Error("context usage calculation was not recognized");
  return source.replace(contextWindowLine, replacement);
}

function patchStatsPush(source) {
  if (source.includes("statsParts.push(formatContextUsageBar(contextPercentValue, contextWindow, this.autoCompactEnabled));")) return source;
  const replacement = "        statsParts.push(formatContextUsageBar(contextPercentValue, contextWindow, this.autoCompactEnabled));";
  const colorBlockPattern = /        \/\/ Colorize context percentage based on usage\n        let contextPercentStr;[\s\S]*?        statsParts\.push\(contextPercentStr\);/;
  if (colorBlockPattern.test(source)) return source.replace(colorBlockPattern, replacement);
  const contextPercentStrPattern = /        let contextPercentStr;[\s\S]*?        statsParts\.push\(contextPercentStr\);/;
  if (contextPercentStrPattern.test(source)) return source.replace(contextPercentStrPattern, replacement);
  const contextDisplayPattern = /        statsParts\.push\([^\n]*(?:contextPercent|contextUsage)[^\n]*\);/;
  if (contextDisplayPattern.test(source)) return source.replace(contextDisplayPattern, replacement);
  throw new Error("context usage stats insertion point was not recognized");
}

function patchDts(dtsPath) {
  if (!pathExists(dtsPath)) return false;
  let source = readFileSync(dtsPath, "utf8");
  if (source.includes("formatContextUsageBar") && source.includes("getContextUsageGradientRgb")) return false;
  const insert = `export interface RgbColor {
    r: number;
    g: number;
    b: number;
}
export declare function getContextUsageGradientRgb(percent: number): RgbColor;
export declare function formatContextUsageBar(percent: number | null, contextWindow: number, autoCompactEnabled: boolean, barWidth?: number): string;
`;
  const anchor = "export declare function formatCwdForFooter";
  const index = source.indexOf(anchor);
  if (index === -1) return false;
  source = `${source.slice(0, index)}${insert}${source.slice(index)}`;
  writeFileSync(dtsPath, source);
  return true;
}

async function smokeTest(footerPath) {
  const mod = await import(`${pathToFileURL(footerPath).href}?pi-context-bar-smoke=${Date.now()}`);
  if (typeof mod.formatContextUsageBar !== "function") throw new Error("formatContextUsageBar export missing after patch");
  if (typeof mod.getContextUsageGradientRgb !== "function") throw new Error("getContextUsageGradientRgb export missing after patch");
  const yellow = mod.getContextUsageGradientRgb(25);
  if (JSON.stringify(yellow) !== JSON.stringify({ r: 255, g: 220, b: 0 })) throw new Error("gradient smoke check failed");
  const plain = mod.formatContextUsageBar(14.6, 272000, true).replace(/\x1b\[[0-9;]*m/g, "");
  if (!plain.includes("15%") || !plain.includes("272k") || plain.includes("15.0%")) throw new Error("bar formatting smoke check failed");
}

async function main() {
  const footerPath = findFooterFile();
  if (!footerPath) throw new Error("could not locate pi footer.js");
  let source = readFileSync(footerPath, "utf8");
  let patched = insertHelper(source);
  patched = patchContextPercentCalculation(patched);
  patched = patchStatsPush(patched);
  if (patched !== source) {
    const backupPath = `${footerPath}.pi-context-bar-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
    copyFileSync(footerPath, backupPath);
    writeFileSync(footerPath, patched);
    info(`patched ${footerPath}`);
    info(`backup written to ${backupPath}`);
  } else {
    info(`${footerPath} is already patched`);
  }
  const dtsChanged = patchDts(footerPath.replace(/\.js$/, ".d.ts"));
  if (dtsChanged) info("patched footer.d.ts declarations");
  await smokeTest(footerPath);
  info("smoke check passed");
}

main().catch((error) => {
  info(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
