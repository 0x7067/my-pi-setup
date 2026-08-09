import assert from "node:assert/strict";
import test from "node:test";
import { formatAccessibilitySnapshot } from "./src/ax.ts";

test("formats useful AX nodes with generation-scoped refs", () => {
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
    { generation: 4 },
  );

  assert.match(output, /Snapshot g4 · Tab 42: Example/);
  assert.match(output, /\[ref=g4:8\] button "Save changes"/);
  assert.match(
    output,
    /\[ref=g4:9\] textbox "Project name" value="Relay" required=true/,
  );
});

test("compacts duplicate text and supports focused snapshots", () => {
  const result = {
    nodes: [
      {
        nodeId: "1",
        backendDOMNodeId: 1,
        role: { value: "RootWebArea" },
        name: { value: "Example" },
        childIds: ["2", "3", "5", "6", "7"],
      },
      {
        nodeId: "2",
        backendDOMNodeId: 2,
        role: { value: "generic" },
        name: { value: "Billing settings" },
        childIds: ["4"],
      },
      {
        nodeId: "3",
        backendDOMNodeId: 3,
        role: { value: "button" },
        name: { value: "Delete project" },
      },
      {
        nodeId: "4",
        backendDOMNodeId: 4,
        role: { value: "StaticText" },
        name: { value: "Billing settings" },
      },
      {
        nodeId: "5",
        backendDOMNodeId: 5,
        role: { value: "paragraph" },
      },
      {
        nodeId: "6",
        ignored: true,
        role: { value: "StaticText" },
        name: { value: "Ignored match" },
      },
      {
        nodeId: "7",
        backendDOMNodeId: 7,
        role: { value: "paragraph" },
        description: { value: "Needle description" },
      },
    ],
  };
  const tab = {
    id: 42,
    windowId: 1,
    active: true,
    title: "Example",
    url: "https://example.com/settings",
  };

  const compact = formatAccessibilitySnapshot(result, tab);
  assert.doesNotMatch(compact, /\[ref=g1:2\] generic/);
  assert.equal(compact.match(/Billing settings/g)?.length, 1);
  assert.doesNotMatch(compact, /^\s*""$/m);

  const focused = formatAccessibilitySnapshot(result, tab, {
    query: "delete",
  });
  assert.match(focused, /Delete project/);
  assert.doesNotMatch(focused, /Billing settings/);

  const focusedContainer = formatAccessibilitySnapshot(result, tab, {
    query: "billing",
  });
  assert.match(focusedContainer, /\[ref=g1:2\] generic "Billing settings"/);

  const empty = formatAccessibilitySnapshot(result, tab, { query: "missing" });
  assert.match(empty, /no snapshot nodes matched "missing"/);

  const ignored = formatAccessibilitySnapshot(result, tab, {
    query: "ignored",
  });
  assert.match(ignored, /no snapshot nodes matched "ignored"/);

  const description = formatAccessibilitySnapshot(result, tab, {
    query: "needle",
  });
  assert.match(description, /"Needle description"/);

  const roleOnly = formatAccessibilitySnapshot(
    {
      nodes: [
        result.nodes[0],
        {
          nodeId: "5",
          backendDOMNodeId: 5,
          role: { value: "paragraph" },
        },
      ],
    },
    tab,
    { query: "paragraph" },
  );
  assert.match(roleOnly, /no snapshot nodes matched "paragraph"/);
  assert.doesNotMatch(roleOnly, /^\s*""$/m);
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

  assert.ok(output.length <= 16_000);
  assert.match(
    output,
    /\n\[snapshot truncated; use query or snapshotMode=full\]$/,
  );
});
