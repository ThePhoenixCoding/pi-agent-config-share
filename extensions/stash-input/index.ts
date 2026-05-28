import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { truncateToWidth } from "@earendil-works/pi-tui";
import { createInputStash } from "./state.mjs";

const WIDGET_KEY = "input-stash";

function updateWidget(ctx: ExtensionContext, statusText: string | undefined) {
	if (!ctx.hasUI) return;

	if (!statusText) {
		ctx.ui.setWidget(WIDGET_KEY, undefined);
		return;
	}

	ctx.ui.setWidget(
		WIDGET_KEY,
		(_tui, theme) => ({
			render(width: number) {
				const text = `${statusText} · Ctrl+Up on empty input restores latest`;
				return [theme.fg("accent", width <= 0 ? "" : truncateToWidth(text, width))];
			},
			invalidate() {},
		}),
		{ placement: "belowEditor" },
	);
}

export default function inputStashExtension(pi: ExtensionAPI) {
	const stash = createInputStash();

	pi.on("session_start", (_event, ctx) => {
		updateWidget(ctx, stash.statusText());
	});

	pi.on("session_shutdown", (_event, ctx) => {
		updateWidget(ctx, undefined);
	});

	pi.registerShortcut("ctrl+up", {
		description: "Stash current input or restore the latest stashed input when the editor is empty",
		handler: async (ctx) => {
			if (!ctx.hasUI) return;

			const result = stash.toggle(ctx.ui.getEditorText());
			if (result.action === "noop") return;

			ctx.ui.setEditorText(result.text);
			updateWidget(ctx, stash.statusText());
		},
	});
}
