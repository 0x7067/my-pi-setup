function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

function decodeBase64Url(value) {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function nonce() {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

async function hmacKey(token) {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(token),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function sign(token, role, value) {
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(token),
    new TextEncoder().encode(`${role}:${value}`),
  );
  return base64Url(new Uint8Array(signature));
}

async function verify(token, role, value, signature) {
  try {
    return await crypto.subtle.verify(
      "HMAC",
      await hmacKey(token),
      decodeBase64Url(signature),
      new TextEncoder().encode(`${role}:${value}`),
    );
  } catch {
    return false;
  }
}

export function createRelayHandshake(token) {
  const clientNonce = nonce();
  let phase = "challenge";

  return {
    clientNonce,
    get authenticated() {
      return phase === "authenticated";
    },
    async acceptChallenge(message) {
      if (
        phase !== "challenge" ||
        typeof message.serverNonce !== "string" ||
        typeof message.serverProof !== "string" ||
        !(await verify(token, "server", clientNonce, message.serverProof))
      ) {
        throw new Error("Relay server authentication failed");
      }
      phase = "ready";
      return {
        type: "authenticate",
        clientProof: await sign(token, "client", message.serverNonce),
      };
    },
    acceptReady() {
      if (phase !== "ready") {
        throw new Error("Relay became ready before authentication completed");
      }
      phase = "authenticated";
    },
  };
}
