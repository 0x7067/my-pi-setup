import { readFileSync } from "node:fs";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const LOADER_TOOL = "tool_search";
export const TOOLBOX_STATE_ENTRY = "toolbox-lazy-state";
const DEFAULT_LIMIT = 1;
export const TOOL_SEARCH_GUIDELINES = [
  "For unauthenticated web research, call tool_search with query 'Hound web research'. For authenticated Chrome or interactive page work, call tool_search with query 'Browser Relay'. Do not use skill_search for these capabilities.",
];
const IGNORED_TERMS = new Set([
  "a",
  "an",
  "and",
  "for",
  "in",
  "of",
  "on",
  "the",
  "to",
  "tool",
  "tools",
  "with",
]);

export interface CatalogConfig {
  catalogs: Array<{
    label: string;
    summary: string;
    sourceIncludes: string[];
  }>;
}

type ToolInfo = ReturnType<ExtensionAPI["getAllTools"]>[number];

interface CatalogTool {
  catalog: CatalogConfig["catalogs"][number];
  tool: ToolInfo;
}

interface ToolboxState {
  enabledCatalogs: string[];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

const config = JSON.parse(
  readFileSync(new URL("./config.json", import.meta.url), "utf8"),
) as CatalogConfig;

function searchableText(tool: ToolInfo, catalog: CatalogTool["catalog"]) {
  return [
    tool.name.replaceAll("_", " "),
    tool.description,
    tool.promptGuidelines?.join(" ") ?? "",
    JSON.stringify(tool.parameters),
    catalog.label,
    catalog.summary,
  ]
    .join(" ")
    .toLowerCase();
}

function queryTerms(query: string) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 1 && !IGNORED_TERMS.has(term));
}

function toolSourceText(tool: ToolInfo) {
  return `${tool.sourceInfo.source}\n${tool.sourceInfo.path}`;
}

export function discoverCatalogTools(
  tools: ToolInfo[],
  catalogConfig: CatalogConfig,
): CatalogTool[] {
  return tools.flatMap((tool) => {
    const source = toolSourceText(tool);
    const catalog = catalogConfig.catalogs.find((candidate) =>
      candidate.sourceIncludes.some((fragment) => source.includes(fragment)),
    );
    return catalog ? [{ catalog, tool }] : [];
  });
}

export function searchCatalogTools(
  catalogTools: CatalogTool[],
  query: string,
  limit = DEFAULT_LIMIT,
) {
  const normalizedQuery = query.trim().toLowerCase();
  const terms = queryTerms(query);
  if (terms.length === 0) return [];

  return catalogTools
    .map(({ catalog, tool }, index) => {
      const name = tool.name.replaceAll("_", " ").toLowerCase();
      const description = tool.description.toLowerCase();
      const metadata = searchableText(tool, catalog);
      let score = metadata.includes(normalizedQuery) ? 8 : 0;
      for (const term of terms) {
        if (name.includes(term)) score += 5;
        if (description.includes(term)) score += 3;
        if (metadata.includes(term)) score += 1;
      }
      return { index, name: tool.name, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .slice(0, Math.max(1, limit))
    .map(({ name }) => name);
}

export function expandMatchingCatalogs(
  catalogTools: CatalogTool[],
  matches: string[],
) {
  const matchedNames = new Set(matches);
  const matchedCatalogs = new Set(
    catalogTools
      .filter(({ tool }) => matchedNames.has(tool.name))
      .map(({ catalog }) => catalog),
  );
  return {
    catalogs: [...matchedCatalogs].map(({ label }) => label),
    tools: catalogTools
      .filter(({ catalog }) => matchedCatalogs.has(catalog))
      .map(({ tool }) => tool.name),
  };
}

export function formatCatalogActivation(
  catalogs: string[],
  tools: string[],
  added: boolean,
) {
  const state = added ? "Loaded" : "Already active";
  return `${state} ${catalogs.join(", ")} and ready to use: ${tools.join(", ")}. Call one of these tools directly; do not install anything.`;
}

/** Restore branch-local catalog state, including sessions from before state entries existed. */
export function restoreCatalogLabels(
  entries: readonly unknown[],
  knownLabels: readonly string[],
) {
  const known = new Set(knownLabels);
  const enabled = new Set<string>();
  for (const candidate of entries) {
    const entry = record(candidate);
    if (!entry) continue;
    if (entry.type === "custom" && entry.customType === TOOLBOX_STATE_ENTRY) {
      enabled.clear();
      const data = record(entry.data);
      for (const label of stringArray(data?.enabledCatalogs)) {
        if (known.has(label)) enabled.add(label);
      }
      continue;
    }
    if (entry.type !== "message") continue;
    const message = record(entry.message);
    if (message?.role !== "toolResult" || message.toolName !== LOADER_TOOL) {
      continue;
    }
    const details = record(message.details);
    for (const label of stringArray(details?.catalogs)) {
      if (known.has(label)) enabled.add(label);
    }
  }
  return knownLabels.filter((label) => enabled.has(label));
}

/**
 * Capable Codex models serialize tools activated by a tool result as deferred
 * definitions. Remove their duplicate prompt metadata so activation changes
 * only the append-only conversation suffix.
 */
export function stabilizeDeferredToolInstructions(
  instructions: string,
  catalogTools: readonly Pick<ToolInfo, "name" | "promptGuidelines">[],
  activeToolNames: readonly string[],
  allTools: readonly Pick<ToolInfo, "name" | "promptGuidelines">[],
) {
  const active = new Set(activeToolNames);
  const catalogNames = new Set(
    catalogTools
      .filter((tool) => active.has(tool.name))
      .map((tool) => tool.name),
  );
  if (catalogNames.size === 0) return instructions;

  const catalogGuidelines = new Set(
    catalogTools
      .filter((tool) => active.has(tool.name))
      .flatMap((tool) => tool.promptGuidelines ?? []),
  );
  const nonCatalogGuidelines = new Set(
    allTools
      .filter((tool) => active.has(tool.name) && !catalogNames.has(tool.name))
      .flatMap((tool) => tool.promptGuidelines ?? []),
  );
  const removableGuidelines = new Set(
    [...catalogGuidelines].filter(
      (guideline) => !nonCatalogGuidelines.has(guideline),
    ),
  );

  let section: "tools" | "guidelines" | undefined;
  return instructions
    .split("\n")
    .filter((line) => {
      if (line === "Available tools:") {
        section = "tools";
        return true;
      }
      if (line.startsWith("In addition to the tools above")) {
        section = undefined;
        return true;
      }
      if (line === "Guidelines:") {
        section = "guidelines";
        return true;
      }
      if (line.startsWith("Pi documentation ")) {
        section = undefined;
        return true;
      }
      if (section === "tools" && line.startsWith("- ")) {
        const separator = line.indexOf(": ", 2);
        const name = separator === -1 ? "" : line.slice(2, separator);
        return !catalogNames.has(name);
      }
      if (section === "guidelines" && line.startsWith("- ")) {
        return !removableGuidelines.has(line.slice(2));
      }
      return true;
    })
    .join("\n");
}

export function supportsDeferredCatalogLoading(model: unknown) {
  const candidate = record(model);
  const compat = record(candidate?.compat);
  return (
    candidate?.api === "openai-codex-responses" &&
    (compat?.supportsAdditionalTools === true ||
      compat?.supportsToolSearch === true)
  );
}

export default function lazyToolbox(pi: ExtensionAPI) {
  let catalogTools: CatalogTool[] = [];
  let hasCustomSystemPrompt = false;
  const enabledCatalogs = new Set<string>();
  const catalogLabels = config.catalogs.map(({ label }) => label);

  const refreshCatalog = () => {
    catalogTools = discoverCatalogTools(pi.getAllTools(), config);
  };

  const syncCatalogTools = () => {
    refreshCatalog();
    const catalogByTool = new Map(
      catalogTools.map(({ catalog, tool }) => [tool.name, catalog]),
    );
    const active = pi.getActiveTools();
    const next = active.filter((name) => {
      const catalog = catalogByTool.get(name);
      return !catalog || enabledCatalogs.has(catalog.label);
    });
    for (const { catalog, tool } of catalogTools) {
      if (enabledCatalogs.has(catalog.label)) next.push(tool.name);
    }
    next.push(LOADER_TOOL);
    const unique = [...new Set(next)];
    if (
      unique.length !== active.length ||
      unique.some((name, index) => name !== active[index])
    ) {
      pi.setActiveTools(unique);
    }
  };

  const catalogStatus = () => {
    const active = new Set(pi.getActiveTools());
    const loaded = catalogTools.filter(({ tool }) =>
      active.has(tool.name),
    ).length;
    return `${loaded}/${catalogTools.length} specialized tools loaded`;
  };

  const orderedEnabledCatalogs = () =>
    catalogLabels.filter((label) => enabledCatalogs.has(label));

  const persistCatalogState = () => {
    pi.appendEntry(TOOLBOX_STATE_ENTRY, {
      enabledCatalogs: orderedEnabledCatalogs(),
    } satisfies ToolboxState);
  };

  const restoreCatalogState = (ctx: ExtensionContext) => {
    enabledCatalogs.clear();
    for (const label of restoreCatalogLabels(
      ctx.sessionManager.getBranch(),
      catalogLabels,
    )) {
      enabledCatalogs.add(label);
    }
    syncCatalogTools();
  };

  const labels = config.catalogs.map(({ label }) => label).join(", ");
  pi.registerTool({
    name: LOADER_TOOL,
    label: "Tool Search",
    description: `Search and activate specialized tools only when needed. The catalog covers ${labels}.`,
    promptSnippet:
      "Use tool_search when a task needs a specialized capability that is not active",
    promptGuidelines: TOOL_SEARCH_GUIDELINES,
    parameters: Type.Object({
      query: Type.String({
        minLength: 2,
        description:
          "Capability or task to find, such as web research or authenticated browser form filling",
      }),
    }),
    async execute(_toolCallId, { query }) {
      refreshCatalog();
      const matches = searchCatalogTools(catalogTools, query);
      if (matches.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No specialized tools found for: ${query}`,
            },
          ],
          details: {
            query,
            matches: [] as string[],
            catalogs: [] as string[],
            added: [] as string[],
          },
        };
      }

      const selection = expandMatchingCatalogs(catalogTools, matches);
      let stateChanged = false;
      for (const catalog of selection.catalogs) {
        if (!enabledCatalogs.has(catalog)) stateChanged = true;
        enabledCatalogs.add(catalog);
      }
      const active = pi.getActiveTools();
      const added = selection.tools.filter((name) => !active.includes(name));
      if (added.length > 0) {
        pi.setActiveTools([...new Set([...active, ...added])]);
      }
      if (stateChanged) persistCatalogState();
      return {
        content: [
          {
            type: "text" as const,
            text: formatCatalogActivation(
              selection.catalogs,
              selection.tools,
              added.length > 0,
            ),
          },
        ],
        details: { query, matches, catalogs: selection.catalogs, added },
      };
    },
  });

  pi.on("session_start", (_event, ctx) => {
    restoreCatalogState(ctx);
  });

  pi.on("session_tree", (_event, ctx) => {
    restoreCatalogState(ctx);
  });

  // Some extensions register tools asynchronously after session_start. Sync at
  // the final pre-request boundary, and avoid setActiveTools when nothing changed.
  pi.on("before_agent_start", (event) => {
    hasCustomSystemPrompt =
      typeof event.systemPromptOptions.customPrompt === "string";
    syncCatalogTools();
  });

  pi.on("before_provider_request", (event, ctx) => {
    if (hasCustomSystemPrompt || !supportsDeferredCatalogLoading(ctx.model)) {
      return;
    }
    const payload = record(event.payload);
    if (!payload || typeof payload.instructions !== "string") return;
    refreshCatalog();
    const instructions = stabilizeDeferredToolInstructions(
      payload.instructions,
      catalogTools.map(({ tool }) => tool),
      pi.getActiveTools(),
      pi.getAllTools(),
    );
    if (instructions === payload.instructions) return;
    return { ...payload, instructions };
  });

  pi.registerCommand("toolbox", {
    description: "Search, load, or inspect specialized tools",
    handler: async (args, ctx: ExtensionContext) => {
      const query = args.trim();
      refreshCatalog();
      if (!query || query === "status") {
        ctx.ui.notify(catalogStatus(), "info");
        return;
      }

      if (query === "all") {
        let stateChanged = false;
        for (const { label } of config.catalogs) {
          if (!enabledCatalogs.has(label)) stateChanged = true;
          enabledCatalogs.add(label);
        }
        const active = pi.getActiveTools();
        const names = catalogTools.map(({ tool }) => tool.name);
        pi.setActiveTools([...new Set([...active, ...names])]);
        if (stateChanged) persistCatalogState();
        ctx.ui.notify(`Loaded all catalog tools · ${catalogStatus()}`, "info");
        return;
      }

      const matches = searchCatalogTools(catalogTools, query);
      if (matches.length === 0) {
        ctx.ui.notify(`No specialized tools found for: ${query}`, "warning");
        return;
      }
      const selection = expandMatchingCatalogs(catalogTools, matches);
      let stateChanged = false;
      for (const catalog of selection.catalogs) {
        if (!enabledCatalogs.has(catalog)) stateChanged = true;
        enabledCatalogs.add(catalog);
      }
      const active = pi.getActiveTools();
      pi.setActiveTools([...new Set([...active, ...selection.tools])]);
      if (stateChanged) persistCatalogState();
      ctx.ui.notify(`Loaded: ${selection.catalogs.join(", ")}`, "info");
    },
  });
}
