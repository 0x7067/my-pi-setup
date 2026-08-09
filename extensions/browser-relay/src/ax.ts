import type { BrowserTab } from "./protocol.ts";

interface AxValue {
  value?: unknown;
}

interface AxProperty {
  name?: string;
  value?: AxValue;
}

interface AxNode {
  nodeId?: string;
  backendDOMNodeId?: number;
  ignored?: boolean;
  role?: AxValue;
  name?: AxValue;
  value?: AxValue;
  description?: AxValue;
  childIds?: string[];
  properties?: AxProperty[];
}

const MAX_LINES = 500;
const MAX_CHARS = 30_000;
const TRUNCATION_MARKER = "\n[snapshot truncated]";
const STRUCTURAL_ROLES = new Set([
  "RootWebArea",
  "article",
  "banner",
  "complementary",
  "contentinfo",
  "dialog",
  "form",
  "heading",
  "main",
  "navigation",
  "region",
  "search",
  "table",
]);

function text(value?: AxValue) {
  if (value?.value === undefined || value.value === null) return "";
  return String(value.value).replace(/\s+/g, " ").trim();
}

function property(node: AxNode, name: string) {
  return text(node.properties?.find((item) => item.name === name)?.value);
}

function shouldPrint(node: AxNode) {
  const role = text(node.role);
  const name = text(node.name);
  const value = text(node.value);
  return (
    !!node.backendDOMNodeId && (!!name || !!value || STRUCTURAL_ROLES.has(role))
  );
}

function formatLine(node: AxNode, depth: number) {
  const role = text(node.role) || "node";
  const name = text(node.name);
  const value = text(node.value);
  const description = text(node.description);
  const states = [
    "checked",
    "disabled",
    "expanded",
    "pressed",
    "required",
    "selected",
  ]
    .map((key) => [key, property(node, key)] as const)
    .filter(([, state]) => state && state !== "false")
    .map(([key, state]) => `${key}=${state}`);
  const parts = [`[nodeId=${node.backendDOMNodeId}]`, role];
  if (name) parts.push(JSON.stringify(name));
  if (value && value !== name) parts.push(`value=${JSON.stringify(value)}`);
  if (description && description !== name) {
    parts.push(`description=${JSON.stringify(description)}`);
  }
  if (states.length > 0) parts.push(states.join(" "));
  return `${"  ".repeat(Math.min(depth, 10))}${parts.join(" ")}`;
}

export function formatAccessibilitySnapshot(result: unknown, tab: BrowserTab) {
  const nodes =
    result &&
    typeof result === "object" &&
    "nodes" in result &&
    Array.isArray(result.nodes)
      ? (result.nodes as AxNode[])
      : [];
  const byId = new Map(
    nodes.flatMap((node) =>
      node.nodeId ? [[node.nodeId, node] as const] : [],
    ),
  );
  const children = new Set(nodes.flatMap((node) => node.childIds ?? []));
  const roots = nodes.filter(
    (node) => node.nodeId && !children.has(node.nodeId),
  );
  const lines = [`Tab ${tab.id}: ${tab.title || "(untitled)"}`, tab.url];
  const seen = new Set<string>();
  let truncated = false;

  const visit = (node: AxNode, depth: number) => {
    if (lines.length >= MAX_LINES || lines.join("\n").length >= MAX_CHARS) {
      truncated = true;
      return;
    }
    if (node.nodeId) {
      if (seen.has(node.nodeId)) return;
      seen.add(node.nodeId);
    }
    if (!node.ignored && shouldPrint(node)) lines.push(formatLine(node, depth));
    for (const childId of node.childIds ?? []) {
      const child = byId.get(childId);
      if (child)
        visit(child, depth + (node.ignored || !shouldPrint(node) ? 0 : 1));
    }
  };

  for (const root of roots.length > 0 ? roots : nodes.slice(0, 1))
    visit(root, 0);
  if (seen.size < nodes.length) {
    for (const node of nodes)
      if (!node.nodeId || !seen.has(node.nodeId)) visit(node, 0);
  }
  const output = lines.join("\n");
  if (truncated || output.length > MAX_CHARS) {
    return `${output.slice(0, MAX_CHARS - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`;
  }
  return output;
}
