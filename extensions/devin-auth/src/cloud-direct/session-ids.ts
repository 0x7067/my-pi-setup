import { createHash, randomUUID } from "node:crypto";

export interface SessionIds {
  sessionId: string;
  cascadeId: string;
}

const fallbackCache = new Map<string, SessionIds>();

function derivedUuid(kind: "session" | "cascade", conversationId: string) {
  const bytes = createHash("sha256")
    .update(`pi-devin-auth\0${kind}\0${conversationId}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function getOrAllocateSessionIds(
  apiKey: string,
  host: string,
  conversationId?: string,
  cascadeIdOverride?: string,
) {
  if (conversationId) {
    return {
      sessionId: derivedUuid("session", conversationId),
      cascadeId: cascadeIdOverride ?? derivedUuid("cascade", conversationId),
    };
  }

  const key = `${host}\x1f${apiKey}`;
  let ids = fallbackCache.get(key);
  if (!ids) {
    ids = {
      sessionId: randomUUID(),
      cascadeId: cascadeIdOverride ?? randomUUID(),
    };
    fallbackCache.set(key, ids);
  } else if (cascadeIdOverride && ids.cascadeId !== cascadeIdOverride) {
    ids = { sessionId: ids.sessionId, cascadeId: cascadeIdOverride };
    fallbackCache.set(key, ids);
  }
  return ids;
}

export function allocateCascadeId() {
  return randomUUID();
}

export function clearSessionIds() {
  fallbackCache.clear();
}
