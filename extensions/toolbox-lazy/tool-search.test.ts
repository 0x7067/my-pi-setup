import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  discoverCatalogTools,
  expandMatchingCatalogs,
  formatCatalogActivation,
  searchCatalogTools,
  TOOL_SEARCH_GUIDELINES,
  type CatalogConfig,
} from "../toolbox-lazy.ts";

type ToolInfo = ReturnType<ExtensionAPI["getAllTools"]>[number];

const catalogConfig: CatalogConfig = {
  catalogs: [
    {
      label: "Hound",
      summary: "web research fetch crawl screenshots",
      sourceIncludes: ["hound-lazy.ts"],
    },
    {
      label: "Browser Relay",
      summary: "direct Chrome browser navigation click fill",
      sourceIncludes: ["/browser-relay/"],
    },
    {
      label: "agent-browser",
      summary: "authenticated browser navigation click fill",
      sourceIncludes: ["pi-agent-browser@"],
    },
  ],
};

function tool(
  name: string,
  description: string,
  source: string,
  path = `/extensions/${source}/index.ts`,
): ToolInfo {
  return {
    name,
    description,
    parameters: { type: "object", properties: {} } as ToolInfo["parameters"],
    promptGuidelines: [],
    sourceInfo: {
      source,
      path,
      scope: "user",
      origin: "top-level",
    },
  };
}

test("discovers every tool from configured sources without naming tools", () => {
  const catalog = discoverCatalogTools(
    [
      tool(
        "web_search",
        "Search the public web",
        "auto",
        "/extensions/hound-lazy.ts",
      ),
      tool(
        "future_hound_tool",
        "A future capability",
        "auto",
        "/extensions/hound-lazy.ts",
      ),
      tool(
        "agent_browser_fill",
        "Fill an input",
        "npm:@53able/pi-agent-browser@0.6.1",
      ),
      tool("read", "Read a local file", "builtin", "<builtin:read>"),
    ],
    catalogConfig,
  );

  assert.deepEqual(
    catalog.map(({ tool: match }) => match.name),
    ["web_search", "future_hound_tool", "agent_browser_fill"],
  );
});

test("ranks exact tool metadata above broad catalog matches", () => {
  const catalog = discoverCatalogTools(
    [
      tool(
        "web_fetch",
        "Fetch a known page",
        "auto",
        "/extensions/hound-lazy.ts",
      ),
      tool(
        "web_search",
        "Search the public web",
        "auto",
        "/extensions/hound-lazy.ts",
      ),
      tool(
        "agent_browser_fill",
        "Fill a form input",
        "npm:@53able/pi-agent-browser@0.6.1",
      ),
      tool(
        "browser-relay",
        "Control Chrome",
        "auto",
        "/extensions/browser-relay/index.ts",
      ),
    ],
    catalogConfig,
  );

  assert.deepEqual(searchCatalogTools(catalog, "search web research", 1), [
    "web_search",
  ]);
  assert.deepEqual(searchCatalogTools(catalog, "fill authenticated form", 1), [
    "agent_browser_fill",
  ]);
  assert.deepEqual(searchCatalogTools(catalog, "Browser Relay", 1), [
    "browser-relay",
  ]);
  assert.deepEqual(searchCatalogTools(catalog, "local database migration"), []);

  assert.deepEqual(expandMatchingCatalogs(catalog, ["web_search"]), {
    catalogs: ["Hound"],
    tools: ["web_fetch", "web_search"],
  });
});

test("activation output tells the model to use loaded tools directly", () => {
  const message = formatCatalogActivation(
    ["Hound web research"],
    ["web_fetch", "web_search"],
    true,
  );
  assert.match(message, /ready to use/);
  assert.match(message, /web_fetch/);
  assert.match(message, /do not install anything/);
});

test("routing guidance distinguishes capability loading from skill search", () => {
  assert.match(TOOL_SEARCH_GUIDELINES[0] ?? "", /call tool_search/);
  assert.match(TOOL_SEARCH_GUIDELINES[0] ?? "", /Hound web research/);
  assert.match(TOOL_SEARCH_GUIDELINES[0] ?? "", /Do not use skill_search/);
});
