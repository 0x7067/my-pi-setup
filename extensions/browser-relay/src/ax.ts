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

export interface SnapshotOptions {
  generation?: number;
  maxChars?: number;
  mode?: "compact" | "full";
  query?: string;
}

const COMPACT_MAX_CHARS = 16_000;
const FULL_MAX_CHARS = 30_000;
const MAX_LINES = 500;
const TRUNCATION_MARKER =
  "\n[snapshot truncated; use query or snapshotMode=full]";
const ACTIONABLE_ROLES = new Set([
  "button",
  "checkbox",
  "combobox",
  "link",
  "listbox",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "option",
  "radio",
  "searchbox",
  "slider",
  "spinbutton",
  "switch",
  "tab",
  "textbox",
  "treeitem",
]);
const STRUCTURAL_ROLES = new Set([
  "rootwebarea",
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
const TEXT_ROLES = new Set(["inlinetextbox", "paragraph", "statictext"]);

function text(value?: AxValue) {
  if (value?.value === undefined || value.value === null) return "";
  return String(value.value).replace(/\s+/g, " ").trim();
}

function role(node: AxNode) {
  return text(node.role).toLowerCase();
}

function property(node: AxNode, name: string) {
  return text(node.properties?.find((item) => item.name === name)?.value);
}

function searchableText(node: AxNode) {
  return [
    text(node.role),
    text(node.name),
    text(node.value),
    text(node.description),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function shouldPrint(node: AxNode, mode: "compact" | "full") {
  if (!node.backendDOMNodeId) return false;
  const nodeRole = role(node);
  const name = text(node.name);
  const value = text(node.value);
  if (mode === "full") {
    return !!name || !!value || STRUCTURAL_ROLES.has(nodeRole);
  }
  if (nodeRole === "inlinetextbox") return false;
  if (TEXT_ROLES.has(nodeRole)) return !!name || !!value;
  return (
    ACTIONABLE_ROLES.has(nodeRole) ||
    STRUCTURAL_ROLES.has(nodeRole) ||
    ((!node.childIds || node.childIds.length === 0) && (!!name || !!value))
  );
}

function formatLine(
  node: AxNode,
  depth: number,
  generation: number,
  ancestorName: string,
) {
  const nodeRole = role(node) || "node";
  const name = text(node.name);
  const value = text(node.value);
  const description = text(node.description);
  if (TEXT_ROLES.has(nodeRole)) {
    const content = name || value || description;
    if (!content || content === ancestorName) return "";
    return `${"  ".repeat(Math.min(depth, 10))}${JSON.stringify(content)}`;
  }
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
  const parts = [
    `[ref=g${generation}:${node.backendDOMNodeId}]`,
    text(node.role) || "node",
  ];
  if (name) parts.push(JSON.stringify(name));
  if (value && value !== name) parts.push(`value=${JSON.stringify(value)}`);
  if (description && description !== name) {
    parts.push(`description=${JSON.stringify(description)}`);
  }
  if (states.length > 0) parts.push(states.join(" "));
  return `${"  ".repeat(Math.min(depth, 10))}${parts.join(" ")}`;
}

export function formatAccessibilitySnapshot(
  result: unknown,
  tab: BrowserTab,
  options: SnapshotOptions = {},
) {
  const mode = options.mode ?? "compact";
  const generation = options.generation ?? 1;
  const maxChars =
    options.maxChars ?? (mode === "full" ? FULL_MAX_CHARS : COMPACT_MAX_CHARS);
  const query = options.query?.trim().toLowerCase();
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
  const parents = new Map<string, string>();
  for (const node of nodes) {
    if (!node.nodeId) continue;
    for (const childId of node.childIds ?? [])
      parents.set(childId, node.nodeId);
  }
  const included = new Set<string>();
  const matches = new Set<string>();
  if (query) {
    for (const node of nodes) {
      if (!node.nodeId || !searchableText(node).includes(query)) continue;
      matches.add(node.nodeId);
      let nodeId: string | undefined = node.nodeId;
      while (nodeId && !included.has(nodeId)) {
        included.add(nodeId);
        nodeId = parents.get(nodeId);
      }
    }
  }
  const roots = nodes.filter(
    (node) => node.nodeId && !parents.has(node.nodeId),
  );
  const lines = [
    `Snapshot g${generation} · Tab ${tab.id}: ${tab.title || "(untitled)"}`,
    tab.url,
  ];
  const seen = new Set<string>();
  let outputChars = lines.join("\n").length;
  let printedMatches = 0;
  let truncated = false;

  const pushLine = (line: string) => {
    if (!line) return false;
    lines.push(line);
    outputChars += line.length + 1;
    if (lines.length >= MAX_LINES || outputChars >= maxChars) truncated = true;
    return true;
  };

  const visit = (node: AxNode, depth: number, ancestorName: string) => {
    if (truncated) return;
    if (node.nodeId) {
      if (seen.has(node.nodeId)) return;
      seen.add(node.nodeId);
    }
    const printable =
      !node.ignored &&
      (shouldPrint(node, mode) ||
        (!!query &&
          !!node.backendDOMNodeId &&
          !!node.nodeId &&
          matches.has(node.nodeId))) &&
      (!query || (!!node.nodeId && included.has(node.nodeId)));
    const nodeName = text(node.name) || text(node.value);
    const printed = printable
      ? pushLine(formatLine(node, depth, generation, ancestorName))
      : false;
    if (printed && node.nodeId && matches.has(node.nodeId)) {
      printedMatches += 1;
    }
    for (const childId of node.childIds ?? []) {
      const child = byId.get(childId);
      if (child) {
        visit(
          child,
          depth + (printed ? 1 : 0),
          printed ? nodeName || ancestorName : ancestorName,
        );
      }
    }
  };

  for (const root of roots.length > 0 ? roots : nodes.slice(0, 1)) {
    visit(root, 0, "");
  }
  if (!query && seen.size < nodes.length) {
    for (const node of nodes) {
      if (!node.nodeId || !seen.has(node.nodeId)) visit(node, 0, "");
    }
  }
  if (query && printedMatches === 0) {
    pushLine(
      `[no snapshot nodes matched ${JSON.stringify(options.query?.trim())}]`,
    );
  }
  const output = lines.join("\n");
  if (truncated || output.length > maxChars) {
    return `${output.slice(0, maxChars - TRUNCATION_MARKER.length)}${TRUNCATION_MARKER}`;
  }
  return output;
}
