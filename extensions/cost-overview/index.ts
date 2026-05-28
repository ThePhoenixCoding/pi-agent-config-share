import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { scanCosts } from "./scanner.ts";
import { showCostOverview } from "./ui.ts";

export default function costOverviewExtension(pi: ExtensionAPI) {
	pi.registerCommand("costs", {
		description: "Show cached pi session costs and tokens by provider",
		handler: async (_args, ctx) => {
			if (ctx.hasUI) {
				ctx.ui.notify("Preparing cost overview...", "info");
			}

			try {
				const scan = await scanCosts(ctx.cwd);
				await showCostOverview(ctx, scan);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				if (ctx.hasUI) {
					ctx.ui.notify(`Could not prepare cost overview: ${message}`, "error");
				} else {
					console.error(`Could not prepare cost overview: ${message}`);
				}
			}
		},
	});
}
