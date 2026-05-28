import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const themes = [
	"material-ui-darker-blue",
	"material-ui-darker-light-blue",
	"material-ui-darker-teal",
	"material-ui-darker-cyan",
	"material-ui-darker-indigo",
	"material-ui-darker-purple",
	"material-ui-darker-deep-purple",
	"material-ui-darker-pink",
	"material-ui-darker-green",
	"material-ui-darker-lime",
	"material-ui-darker-electric-lime",
	"material-ui-darker-yellow",
	"material-ui-darker-amber",
	"material-ui-darker-orange",
	"material-ui-darker-deep-orange",
	"material-ui-darker-red",
] as const;

const statePath = join(homedir(), ".pi", "agent", "random-theme-state.json");

type RandomThemeState = {
	lastTheme?: string;
};

async function readState(): Promise<RandomThemeState> {
	try {
		return JSON.parse(await readFile(statePath, "utf8")) as RandomThemeState;
	} catch {
		return {};
	}
}

async function writeState(state: RandomThemeState): Promise<void> {
	await mkdir(dirname(statePath), { recursive: true });
	await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function chooseTheme(lastTheme: string | undefined): string {
	const candidates = themes.filter((theme) => theme !== lastTheme);
	const pool = candidates.length > 0 ? candidates : themes;
	return pool[Math.floor(Math.random() * pool.length)];
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;

		const state = await readState();
		const theme = chooseTheme(state.lastTheme);
		const themeInstance = ctx.ui.getTheme(theme);
		if (!themeInstance) {
			ctx.ui.notify(`Random theme failed: ${theme}`, "warning");
			return;
		}

		ctx.ui.setTheme(themeInstance);
		await writeState({ lastTheme: theme });
		ctx.ui.notify(`Theme: ${theme.replace("material-ui-darker-", "")}`, "info");
	});

	pi.registerCommand("random-theme", {
		description: "Switch to another random Material UI darker theme",
		handler: async (_args, ctx) => {
			const state = await readState();
			const theme = chooseTheme(state.lastTheme);
			const themeInstance = ctx.ui.getTheme(theme);
			if (!themeInstance) {
				ctx.ui.notify(`Random theme failed: ${theme}`, "warning");
				return;
			}

			ctx.ui.setTheme(themeInstance);
			await writeState({ lastTheme: theme });
			ctx.ui.notify(`Theme: ${theme.replace("material-ui-darker-", "")}`, "info");
		},
	});
}
