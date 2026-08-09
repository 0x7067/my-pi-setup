import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { createRelayHandshake } from "./chrome-extension/auth.js";

function proof(token: string, role: "client" | "server", nonce: string) {
  return createHmac("sha256", token)
    .update(`${role}:${nonce}`)
    .digest("base64url");
}

test("rejects ready until the server proof has been verified", () => {
  const handshake = createRelayHandshake("token-that-is-long-enough");
  assert.throws(
    () => handshake.acceptReady(),
    /before authentication completed/,
  );
  assert.equal(handshake.authenticated, false);
});

test("authenticates only after a valid challenge followed by ready", async () => {
  const token = "token-that-is-long-enough";
  const handshake = createRelayHandshake(token);
  const serverNonce = "server-nonce-that-is-long-enough";
  const response = await handshake.acceptChallenge({
    serverNonce,
    serverProof: proof(token, "server", handshake.clientNonce),
  });
  assert.equal(response.clientProof, proof(token, "client", serverNonce));
  assert.equal(handshake.authenticated, false);
  handshake.acceptReady();
  assert.equal(handshake.authenticated, true);
});
