import { readFileSync } from "node:fs";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

const LOADER_TOOL = "tool_search";
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

const config = JSON.parse(
  readFileSync(new URL("./toolbox-lazy.json", import.meta.url), "utf8"),
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

export default function lazyToolbox(pi: ExtensionAPI) {
  let catalogTools: CatalogTool[] = [];
  const enabledCatalogs = new Set<string>();

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
      for (const catalog of selection.catalogs) enabledCatalogs.add(catalog);
      const active = pi.getActiveTools();
      const added = selection.tools.filter((name) => !active.includes(name));
      if (added.length > 0) {
        pi.setActiveTools([...new Set([...active, ...added])]);
      }
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

  pi.on("session_start", () => {
    enabledCatalogs.clear();
    syncCatalogTools();
  });

  // Some extensions register tools asynchronously after session_start. Sync at
  // the final pre-request boundary, and avoid setActiveTools when nothing changed.
  pi.on("before_agent_start", () => {
    syncCatalogTools();
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
        for (const { label } of config.catalogs) enabledCatalogs.add(label);
        const active = pi.getActiveTools();
        const names = catalogTools.map(({ tool }) => tool.name);
        pi.setActiveTools([...new Set([...active, ...names])]);
        ctx.ui.notify(`Loaded all catalog tools · ${catalogStatus()}`, "info");
        return;
      }

      const matches = searchCatalogTools(catalogTools, query);
      if (matches.length === 0) {
        ctx.ui.notify(`No specialized tools found for: ${query}`, "warning");
        return;
      }
      const selection = expandMatchingCatalogs(catalogTools, matches);
      for (const catalog of selection.catalogs) enabledCatalogs.add(catalog);
      const active = pi.getActiveTools();
      pi.setActiveTools([...new Set([...active, ...selection.tools])]);
      ctx.ui.notify(`Loaded: ${selection.catalogs.join(", ")}`, "info");
    },
  });
}
