import { readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

const ATLASSIAN_MCP_URL = "https://mcp.atlassian.com/v1/mcp/authv2";
const ATLASSIAN_TOKEN_URL = "https://auth.atlassian.com/oauth/token";

type JsonObject = Record<string, unknown>;

type StoredTokenFile = {
  serverUrl?: string;
  clientInfo?: {
    clientId?: string;
    clientSecret?: string;
  };
  tokens?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    scope?: string;
  };
};

type AccessibleResource = {
  id: string;
  url: string;
  name: string;
};

type SlimComment = {
  author: string;
  created: string;
  text: string;
};

type SlimIssue = {
  key: string;
  summary: string;
  descriptionText: string;
  comments: SlimComment[];
};

type MarkdownContext = {
  imageUrlsByFilename?: Map<string, string>;
};

export async function readJiraSlimIssue(params: { issueIdOrKey: string; cloudId?: string; siteUrl?: string }): Promise<SlimIssue> {
  const token = await getValidAccessToken();
  const resource = await resolveResource(token, params.cloudId, params.siteUrl);
  const issueKey = encodeURIComponent(params.issueIdOrKey);
  const issue = await fetchJson<JsonObject>(
    `https://api.atlassian.com/ex/jira/${encodeURIComponent(resource.id)}/rest/api/3/issue/${issueKey}?fields=summary,description,attachment`,
    token,
  );
  const fields = asObject(issue.fields, "issue.fields");
  const comments = await readAllComments(resource.id, params.issueIdOrKey, token);
  const imageUrlsByFilename = buildImageUrls(fields.attachment);

  return projectSlimIssue(issue, comments, { imageUrlsByFilename });
}

export function projectSlimIssue(issue: JsonObject, comments: JsonObject[], context: MarkdownContext = {}): SlimIssue {
  const fields = asObject(issue.fields, "issue.fields");
  return {
    key: stringValue(issue.key),
    summary: stringValue(fields.summary),
    descriptionText: adfToMarkdown(fields.description, context),
    comments: comments.map((comment) => {
      const author = typeof comment.author === "object" && comment.author !== null
        ? stringValue((comment.author as JsonObject).displayName)
        : "";
      return {
        author,
        created: stringValue(comment.created),
        text: adfToMarkdown(comment.body, context),
      };
    }),
  };
}

export function adfToMarkdown(node: unknown, context: MarkdownContext = {}): string {
  return renderNode(node, context).replace(/\n{3,}/g, "\n\n").replace(/\n+$/, "");
}

async function getValidAccessToken(): Promise<string> {
  const tokenFile = await findAtlassianTokenFile();
  const raw = await readFile(tokenFile, "utf8");
  const data = JSON.parse(raw) as StoredTokenFile;
  const token = data.tokens?.accessToken;
  const expiresAt = data.tokens?.expiresAt;

  if (token && (!expiresAt || expiresAt * 1000 > Date.now() + 60_000)) {
    return token;
  }

  const refreshToken = data.tokens?.refreshToken;
  const clientId = data.clientInfo?.clientId;
  const clientSecret = data.clientInfo?.clientSecret;
  if (!refreshToken || !clientId) {
    throw new Error("No valid Atlassian OAuth token found. Run /mcp-auth jira first.");
  }

  const body: JsonObject = {
    grant_type: "refresh_token",
    client_id: clientId,
    refresh_token: refreshToken,
  };
  if (clientSecret) body.client_secret = clientSecret;

  const response = await fetch(ATLASSIAN_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh Atlassian OAuth token: HTTP ${response.status} ${await response.text()}`);
  }

  const refreshed = await response.json() as JsonObject;
  const accessToken = stringValue(refreshed.access_token);
  if (!accessToken) throw new Error("Atlassian OAuth refresh did not return an access token.");

  data.tokens = {
    ...data.tokens,
    accessToken,
    refreshToken: stringValue(refreshed.refresh_token) || refreshToken,
    expiresAt: Math.floor(Date.now() / 1000) + numberValue(refreshed.expires_in, 3600),
    scope: stringValue(refreshed.scope) || data.tokens?.scope,
  };
  await writeFile(tokenFile, JSON.stringify(data, null, 2), "utf8");

  return accessToken;
}

async function findAtlassianTokenFile(): Promise<string> {
  const dir = join(homedir(), ".pi", "agent", "mcp-oauth");
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const path = join(dir, entry.name, "tokens.json");
    try {
      const data = JSON.parse(await readFile(path, "utf8")) as StoredTokenFile;
      if (data.serverUrl === ATLASSIAN_MCP_URL) return path;
    } catch {}
  }
  throw new Error("No Atlassian OAuth token file found. Run /mcp-auth jira first.");
}

async function resolveResource(token: string, cloudId?: string, siteUrl?: string): Promise<AccessibleResource> {
  if (cloudId) {
    return { id: cloudId, url: siteUrl ?? "", name: cloudId };
  }

  const resources = await fetchJson<AccessibleResource[]>("https://api.atlassian.com/oauth/token/accessible-resources", token);
  if (siteUrl) {
    const normalized = normalizeSiteUrl(siteUrl);
    const resource = resources.find((candidate) => normalizeSiteUrl(candidate.url) === normalized);
    if (!resource) throw new Error(`No accessible Atlassian resource found for ${siteUrl}.`);
    return resource;
  }
  if (resources.length === 1) return resources[0];
  if (resources.length === 0) throw new Error("No accessible Atlassian resources found.");

  const names = resources.map((resource) => `${resource.name} (${resource.url}, ${resource.id})`).join(", ");
  throw new Error(`Multiple Atlassian resources available. Pass cloudId or siteUrl. Available: ${names}`);
}

async function readAllComments(cloudId: string, issueIdOrKey: string, token: string): Promise<JsonObject[]> {
  const comments: JsonObject[] = [];
  let startAt = 0;
  const maxResults = 100;

  while (true) {
    const issueKey = encodeURIComponent(issueIdOrKey);
    const page = await fetchJson<JsonObject>(
      `https://api.atlassian.com/ex/jira/${encodeURIComponent(cloudId)}/rest/api/3/issue/${issueKey}/comment?orderBy=created&startAt=${startAt}&maxResults=${maxResults}`,
      token,
    );
    const pageComments = Array.isArray(page.comments) ? page.comments as JsonObject[] : [];
    comments.push(...pageComments);
    startAt += pageComments.length;
    if (startAt >= numberValue(page.total, 0) || pageComments.length === 0) return comments;
  }
}

async function fetchJson<T>(url: string, token: string): Promise<T> {
  const response = await fetch(url, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  if (!response.ok) throw new Error(`Jira request failed: HTTP ${response.status} ${await response.text()}`);
  return await response.json() as T;
}

function buildImageUrls(attachments: unknown): Map<string, string> {
  const urls = new Map<string, string>();
  if (!Array.isArray(attachments)) return urls;
  for (const attachment of attachments) {
    if (typeof attachment !== "object" || attachment === null) continue;
    const object = attachment as JsonObject;
    const filename = stringValue(object.filename);
    const content = stringValue(object.content);
    if (filename && content) urls.set(filename, content);
  }
  return urls;
}

function renderNode(node: unknown, context: MarkdownContext): string {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map((child) => renderNode(child, context)).join("");
  if (typeof node !== "object") return String(node);

  const object = node as JsonObject;
  const type = stringValue(object.type);
  const content = object.content;
  const attrs = typeof object.attrs === "object" && object.attrs !== null ? object.attrs as JsonObject : {};

  switch (type) {
    case "doc":
      return renderBlocks(content, context);
    case "paragraph":
      return renderInline(content, context);
    case "heading": {
      const level = Math.max(1, Math.min(6, numberValue(attrs.level, 1)));
      return `${"#".repeat(level)} ${renderInline(content, context)}`;
    }
    case "blockquote":
      return renderBlocks(content, context).split("\n").map((line) => `> ${line}`).join("\n");
    case "bulletList":
      return renderList(content, context, "bullet");
    case "orderedList":
      return renderList(content, context, "ordered", numberValue(attrs.order, 1));
    case "listItem":
      return renderBlocks(content, context);
    case "codeBlock":
      return `\`\`\`${stringValue(attrs.language)}\n${renderTextContent(content)}\n\`\`\``;
    case "hardBreak":
      return "  \n";
    case "text":
      return applyMarks(stringValue(object.text), object.marks);
    case "mention":
      return stringValue(attrs.text) || stringValue(attrs.id);
    case "inlineCard":
    case "blockCard":
      return stringValue(attrs.url);
    case "mediaSingle":
    case "mediaGroup":
      return renderBlocks(content, context);
    case "media": {
      const alt = stringValue(attrs.alt) || stringValue(attrs.id) || "image";
      const url = context.imageUrlsByFilename?.get(alt) || stringValue(attrs.url) || stringValue(attrs.id);
      return `![${alt}](${url})`;
    }
    case "rule":
      return "---";
    default:
      if (Array.isArray(content)) return renderBlocks(content, context);
      return "";
  }
}

function renderBlocks(content: unknown, context: MarkdownContext): string {
  if (!Array.isArray(content)) return "";
  return content.map((child) => renderNode(child, context)).join("\n\n");
}

function renderInline(content: unknown, context: MarkdownContext): string {
  if (!Array.isArray(content)) return "";
  return content.map((child) => renderNode(child, context)).join("");
}

function renderList(content: unknown, context: MarkdownContext, type: "bullet" | "ordered", start = 1): string {
  if (!Array.isArray(content)) return "";
  return content.map((item, index) => {
    const marker = type === "bullet" ? "*" : `${start + index}.`;
    const rendered = renderNode(item, context);
    const lines = rendered.split("\n");
    const first = lines.shift() ?? "";
    const rest = lines.map((line) => `  ${line}`).join("\n");
    return rest ? `${marker} ${first}\n${rest}` : `${marker} ${first}`;
  }).join("\n");
}

function renderTextContent(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content.map((child) => {
    if (typeof child !== "object" || child === null) return "";
    const object = child as JsonObject;
    if (object.type === "text") return stringValue(object.text);
    if (object.type === "hardBreak") return "\n";
    return renderTextContent(object.content);
  }).join("");
}

function applyMarks(text: string, marks: unknown): string {
  if (!Array.isArray(marks)) return text;
  return marks.reduce((current, mark) => {
    if (typeof mark !== "object" || mark === null) return current;
    const object = mark as JsonObject;
    const type = stringValue(object.type);
    const attrs = typeof object.attrs === "object" && object.attrs !== null ? object.attrs as JsonObject : {};
    if (type === "strong") return `**${current}**`;
    if (type === "em") return `_${current}_`;
    if (type === "code") return `\`${current}\``;
    if (type === "strike") return `~~${current}~~`;
    if (type === "link") return `[${current}](${stringValue(attrs.href)})`;
    return current;
  }, text);
}

function asObject(value: unknown, name: string): JsonObject {
  if (typeof value === "object" && value !== null) return value as JsonObject;
  throw new Error(`${name} missing or not an object.`);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeSiteUrl(value: string): string {
  return value.replace(/\/$/, "").toLowerCase();
}
