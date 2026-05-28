import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { copyToClipboard } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";

async function copyInput(ctx: ExtensionContext): Promise<void> {
	if (!ctx.hasUI) return;

	const text = ctx.ui.getEditorText();
	await copyToClipboard(text);

	const length = [...text].length;
	ctx.ui.notify(length === 0 ? "Copied empty input" : `Copied input (${length} chars)`, "info");
}

export default function copyInputExtension(pi: ExtensionAPI) {
	pi.registerShortcut(Key.ctrlShift("c"), {
		description: "Copy current input to clipboard",
		handler: async (ctx) => {
			await copyInput(ctx);
		},
	});
}
