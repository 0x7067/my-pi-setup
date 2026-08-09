import assert from "node:assert/strict";
import test from "node:test";
import { jsonText } from "./index.ts";

test("bounds JSON returned to the model context", () => {
  assert.equal(jsonText(undefined), "null");
  assert.throws(
    () => jsonText("x".repeat(1024 * 1024)),
    /result exceeds 1 MiB/,
  );
});
