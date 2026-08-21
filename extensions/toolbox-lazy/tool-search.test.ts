import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  default as lazyToolbox,
  discoverCatalogTools,
  expandMatchingCatalogs,
  formatCatalogActivation,
  restoreCatalogLabels,
  searchCatalogTools,
  stabilizeDeferredToolInstructions,
  supportsDeferredCatalogLoading,
  TOOLBOX_STATE_ENTRY,
  TOOL_SEARCH_GUIDELINES,
  type CatalogConfig,
} from "./index.ts";

type ToolInfo = ReturnType<ExtensionAPI["getAllTools"]>[number];

const catalogConfig: CatalogConfig = {
  catalogs: [
    {
      label: "Hound",
      summary: "web research fetch crawl screenshots",
      sourceIncludes: ["hound-lazy/index.ts"],
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
        "/extensions/hound-lazy/index.ts",
      ),
      tool(
        "future_hound_tool",
        "A future capability",
        "auto",
        "/extensions/hound-lazy/index.ts",
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
        "/extensions/hound-lazy/index.ts",
      ),
      tool(
        "web_search",
        "Search the public web",
        "auto",
        "/extensions/hound-lazy/index.ts",
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

test("restores branch-local catalog state and legacy tool-search activations", () => {
  const entries = [
    {
      type: "message",
      message: {
        role: "toolResult",
        toolName: "tool_search",
        details: { catalogs: ["Hound", "removed catalog"] },
      },
    },
    {
      type: "custom",
      customType: TOOLBOX_STATE_ENTRY,
      data: { enabledCatalogs: ["Browser Relay"] },
    },
    {
      type: "message",
      message: {
        role: "toolResult",
        toolName: "tool_search",
        details: { catalogs: ["agent-browser"] },
      },
    },
  ];

  assert.deepEqual(
    restoreCatalogLabels(entries, ["Hound", "Browser Relay", "agent-browser"]),
    ["Browser Relay", "agent-browser"],
  );
});

test("removes deferred catalog prompt metadata while preserving shared guidance", () => {
  const instructions = `Available tools:
- tool_search: Load specialized tools
- web_search: Search the public web
- browser-relay: Control Chrome

In addition to the tools above, custom tools may be available.

Guidelines:
- Keep this shared rule
- Check content_ok before trusting web content
- Use fresh browser refs

Pi documentation (read only when asked):`;
  const catalogTools = [
    {
      name: "web_search",
      promptGuidelines: [
        "Check content_ok before trusting web content",
        "Keep this shared rule",
      ],
    },
    {
      name: "browser-relay",
      promptGuidelines: ["Use fresh browser refs"],
    },
  ];
  const allTools = [
    ...catalogTools,
    { name: "tool_search", promptGuidelines: ["Keep this shared rule"] },
  ];

  assert.equal(
    stabilizeDeferredToolInstructions(
      instructions,
      catalogTools,
      ["tool_search", "web_search", "browser-relay"],
      allTools,
    ),
    `Available tools:
- tool_search: Load specialized tools

In addition to the tools above, custom tools may be available.

Guidelines:
- Keep this shared rule

Pi documentation (read only when asked):`,
  );
});

test("limits instruction stabilization to Codex adapters with deferred tools", () => {
  assert.equal(
    supportsDeferredCatalogLoading({
      api: "openai-codex-responses",
      compat: { supportsAdditionalTools: true },
    }),
    true,
  );
  assert.equal(
    supportsDeferredCatalogLoading({
      api: "openai-codex-responses",
      compat: { supportsToolSearch: true },
    }),
    true,
  );
  assert.equal(
    supportsDeferredCatalogLoading({
      api: "openai-responses",
      compat: { supportsAdditionalTools: true },
    }),
    false,
  );
});

test("tool search persists activation and stabilizes the outgoing Codex prompt", async () => {
  const handlers = new Map<string, Function[]>();
  const registeredTools = new Map<
    string,
    { execute?: (...args: unknown[]) => Promise<unknown> }
  >();
  const appended: Array<{ customType: string; data: unknown }> = [];
  const allTools: ToolInfo[] = [
    tool("read", "Read files", "builtin", "<builtin:read>"),
    tool(
      "web_search",
      "Search the public web",
      "auto",
      "/extensions/hound-lazy/index.ts",
    ),
  ];
  let active = ["read", "web_search"];
  const pi = {
    getAllTools: () => allTools,
    getActiveTools: () => active,
    setActiveTools: (names: string[]) => {
      active = names;
    },
    appendEntry: (customType: string, data: unknown) => {
      appended.push({ customType, data });
    },
    registerTool: (definition: {
      name: string;
      description: string;
      parameters: ToolInfo["parameters"];
      promptGuidelines?: string[];
      execute?: (...args: unknown[]) => Promise<unknown>;
    }) => {
      registeredTools.set(definition.name, definition);
      allTools.push({
        name: definition.name,
        description: definition.description,
        parameters: definition.parameters,
        promptGuidelines: definition.promptGuidelines,
        sourceInfo: {
          source: "toolbox-lazy",
          path: "/extensions/toolbox-lazy/index.ts",
          scope: "user",
          origin: "top-level",
        },
      });
    },
    registerCommand: () => {},
    on: (event: string, handler: Function) => {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
  } as unknown as ExtensionAPI;
  lazyToolbox(pi);

  const context = {
    sessionManager: { getBranch: () => [] },
    model: {
      api: "openai-codex-responses",
      compat: { supportsAdditionalTools: true },
    },
  };
  await handlers.get("session_start")?.[0]?.({}, context);
  assert.deepEqual(active, ["read", "tool_search"]);

  await registeredTools.get("tool_search")?.execute?.("call-1", {
    query: "web research",
  });
  assert.deepEqual(active, ["read", "tool_search", "web_search"]);
  assert.deepEqual(appended, [
    {
      customType: TOOLBOX_STATE_ENTRY,
      data: { enabledCatalogs: ["Hound web research"] },
    },
  ]);

  const outgoing = await handlers.get("before_provider_request")?.[0]?.(
    {
      payload: {
        instructions: `Available tools:
- tool_search: Load specialized tools
- web_search: Search the public web

In addition to the tools above, custom tools may be available.

Guidelines:
- Be concise

Pi documentation (read only when asked):`,
      },
    },
    context,
  );
  assert.equal(
    outgoing.instructions,
    `Available tools:
- tool_search: Load specialized tools

In addition to the tools above, custom tools may be available.

Guidelines:
- Be concise

Pi documentation (read only when asked):`,
  );

  await handlers.get("before_agent_start")?.[0]?.({
    systemPromptOptions: { customPrompt: "Keep my explicit tool guidance" },
  });
  const customPromptResult = await handlers.get(
    "before_provider_request",
  )?.[0]?.(
    { payload: { instructions: "Keep my explicit tool guidance" } },
    context,
  );
  assert.equal(customPromptResult, undefined);
});
