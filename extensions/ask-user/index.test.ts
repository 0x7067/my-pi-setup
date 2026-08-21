import assert from "node:assert/strict";
import test from "node:test";
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import askUser from "./index.ts";

test("renders the question as an overlay without resizing the editor", async () => {
  let tool: ToolDefinition<any, any, any> | undefined;
  let customOptions: unknown;

  askUser({
    registerTool(registeredTool) {
      tool = registeredTool;
    },
  } as ExtensionAPI);

  assert.ok(tool);
  await tool.execute(
    "call-1",
    {
      question: "Continue?",
      options: [{ label: "Yes" }, { label: "No" }],
    },
    undefined,
    undefined,
    {
      mode: "tui",
      ui: {
        custom: async (_factory: unknown, options: unknown) => {
          customOptions = options;
          return null;
        },
      },
    } as unknown as ExtensionContext,
  );

  assert.deepEqual(customOptions, {
    overlay: true,
    overlayOptions: {
      anchor: "center",
      margin: 1,
      maxHeight: "100%",
      width: "95%",
    },
  });
});
