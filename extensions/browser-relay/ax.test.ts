import assert from "node:assert/strict";
import test from "node:test";
import { formatAccessibilitySnapshot } from "./src/ax.ts";

test("formats useful AX nodes and preserves backend node IDs", () => {
  const output = formatAccessibilitySnapshot(
    {
      nodes: [
        {
          nodeId: "1",
          backendDOMNodeId: 1,
          role: { value: "RootWebArea" },
          name: { value: "Example" },
          childIds: ["2", "3"],
        },
        {
          nodeId: "2",
          backendDOMNodeId: 8,
          role: { value: "button" },
          name: { value: "Save changes" },
        },
        {
          nodeId: "3",
          ignored: true,
          childIds: ["4"],
        },
        {
          nodeId: "4",
          backendDOMNodeId: 9,
          role: { value: "textbox" },
          name: { value: "Project name" },
          value: { value: "Relay" },
          properties: [{ name: "required", value: { value: true } }],
        },
      ],
    },
    {
      id: 42,
      windowId: 1,
      active: true,
      title: "Example",
      url: "https://example.com/settings",
    },
  );

  assert.match(output, /Tab 42: Example/);
  assert.match(output, /\[nodeId=8\] button "Save changes"/);
  assert.match(
    output,
    /\[nodeId=9\] textbox "Project name" value="Relay" required=true/,
  );
});

test("preserves the truncation marker within the character limit", () => {
  const output = formatAccessibilitySnapshot(
    {
      nodes: [
        {
          nodeId: "1",
          backendDOMNodeId: 1,
          role: { value: "RootWebArea" },
          name: { value: "x".repeat(31_000) },
        },
      ],
    },
    {
      id: 7,
      windowId: 1,
      active: true,
      title: "Large",
      url: "https://example.com",
    },
  );

  assert.ok(output.length <= 30_000);
  assert.match(output, /\n\[snapshot truncated\]$/);
});
