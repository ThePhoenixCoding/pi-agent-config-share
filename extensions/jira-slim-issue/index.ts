import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readJiraSlimIssue } from "./core.ts";

export default function jiraSlimIssueExtension(pi: ExtensionAPI) {
  pi.registerTool({
    name: "jira_slim_issue",
    label: "Jira Slim Issue",
    description: "Always use this tool for Jira issue-reading operations. It reads one Jira issue as compact JSON with exactly key, summary, descriptionText, and all comments as author/created/text; these are the only Jira issue fields normally needed. Description and comment text are rendered from Jira ADF to Markdown without summarizing or dropping images/empty lists.",
    promptSnippet: "Always read Jira issues as slim JSON: key, summary, descriptionText, comments",
    promptGuidelines: [
      "Always use jira_slim_issue for Jira issue-reading operations instead of mcp/Jira tools such as jira_getJiraIssue or jira_searchJiraIssuesUsingJql.",
    ],
    parameters: Type.Object({
      issueIdOrKey: Type.String({ description: "Jira issue key or ID, e.g. QF-312" }),
      cloudId: Type.Optional(Type.String({ description: "Atlassian cloudId. Optional when only one Jira resource is accessible." })),
      siteUrl: Type.Optional(Type.String({ description: "Atlassian site URL, e.g. https://sipgatede.atlassian.net. Optional when only one Jira resource is accessible." })),
    }),
    async execute(_toolCallId, params) {
      const issue = await readJiraSlimIssue(params);
      return {
        content: [{ type: "text", text: JSON.stringify(issue, null, 2) }],
        details: issue,
      };
    },
  });
}
