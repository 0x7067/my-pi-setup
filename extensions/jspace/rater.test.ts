import assert from "node:assert/strict";
import test from "node:test";
import { parseRatingResponse, REASON_MAX_LENGTH } from "./src/rater.ts";

test("rating parser accepts bare, fenced, and embedded JSON", () => {
  assert.deepEqual(parseRatingResponse('{"outcome":"ok","reason":"done"}'), {
    outcome: "ok",
    reason: "done",
  });
  assert.deepEqual(
    parseRatingResponse(
      '```json\n{"outcome":"FAIL","reason":"tests red"}\n```',
    ),
    { outcome: "fail", reason: "tests red" },
  );
  assert.deepEqual(
    parseRatingResponse('Sure. {"outcome":"unclear","reason":"chat only"} ok?'),
    { outcome: "unclear", reason: "chat only" },
  );
});

test("rating parser rejects unknown outcomes and cleans reasons", () => {
  assert.equal(
    parseRatingResponse('{"outcome":"great","reason":"x"}'),
    undefined,
  );
  assert.equal(parseRatingResponse("no json here"), undefined);
  assert.equal(parseRatingResponse('["ok"]'), undefined);
  assert.equal(
    parseRatingResponse('{"outcome":"ok","reason":"  "}'),
    undefined,
  );
  assert.equal(parseRatingResponse('{"outcome":"fail"}'), undefined);
  assert.deepEqual(parseRatingResponse('{"outcome":"unclear"}'), {
    outcome: "unclear",
    reason: "",
  });
  const long = "a".repeat(REASON_MAX_LENGTH + 50);
  const parsed = parseRatingResponse(
    JSON.stringify({ outcome: "ok", reason: `\u001b[31m${long}\n\tx` }),
  );
  assert.equal(parsed?.outcome, "ok");
  assert.equal(parsed?.reason.length, REASON_MAX_LENGTH);
  assert.ok(!parsed?.reason.includes("\u001b"));
});
