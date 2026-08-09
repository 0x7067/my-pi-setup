import { createRelayHandshake } from "./auth.js";

const DEFAULT_PORT = 9234;
const allowedTabs = new Set();
const attachedTabs = new Set();
let socket;
let reconnectDelay = 1000;
let reconnectTimer;
let keepaliveTimer;

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function isAttachable(url) {
  return /^(https?|file):/.test(url ?? "");
}

async function options() {
  return await chrome.storage.local.get({ port: DEFAULT_PORT, token: "" });
}

async function saveAllowedTabs() {
  await chrome.storage.session.set({ allowedTabIds: [...allowedTabs] });
}

async function setConnectionBadge(text, color) {
  await chrome.action.setBadgeText({ text });
  if (color) await chrome.action.setBadgeBackgroundColor({ color });
}

async function setTabBadge(tabId, selected) {
  await chrome.action.setBadgeText({ tabId, text: selected ? "PI" : "" });
  if (selected) {
    await chrome.action.setBadgeBackgroundColor({ tabId, color: "#2367d1" });
  }
}

async function restoreAllowedTabs() {
  const saved = await chrome.storage.session.get({ allowedTabIds: [] });
  const tabs = await chrome.tabs.query({});
  const existing = new Set(tabs.map((tab) => tab.id));
  for (const tabId of saved.allowedTabIds) {
    if (Number.isInteger(tabId) && existing.has(tabId)) {
      allowedTabs.add(tabId);
      await setTabBadge(tabId, true);
    }
  }
  await saveAllowedTabs();
}

const allowedTabsReady = restoreAllowedTabs();

async function detachAll() {
  const tabIds = [...attachedTabs];
  attachedTabs.clear();
  await Promise.allSettled(
    tabIds.map((tabId) => chrome.debugger.detach({ tabId })),
  );
}

async function ensureAttached(tabId) {
  await allowedTabsReady;
  if (!allowedTabs.has(tabId)) {
    throw new Error(
      `Tab ${tabId} is not shared. Click the Pi Browser Relay toolbar icon on that tab first.`,
    );
  }
  if (attachedTabs.has(tabId)) return;
  await chrome.debugger.attach({ tabId }, "1.3");
  attachedTabs.add(tabId);
}

async function execute(command) {
  await allowedTabsReady;
  if (command.action === "tabs") {
    const tabs = await chrome.tabs.query({});
    return {
      tabs: tabs
        .filter(
          (tab) =>
            Number.isInteger(tab.id) &&
            allowedTabs.has(tab.id) &&
            isAttachable(tab.url),
        )
        .map((tab) => ({
          id: tab.id,
          windowId: tab.windowId,
          active: tab.active,
          title: tab.title ?? "",
          url: tab.url ?? "",
        })),
    };
  }
  if (command.action !== "cdp" || !Number.isInteger(command.tabId)) {
    throw new Error("Invalid relay command");
  }
  await ensureAttached(command.tabId);
  return await chrome.debugger.sendCommand(
    { tabId: command.tabId },
    command.method,
    command.params ?? {},
  );
}

async function handleMessage(current, handshake, event) {
  if (socket !== current) return;
  let message;
  try {
    message = JSON.parse(event.data);
    if (message.type === "challenge") {
      current.send(JSON.stringify(await handshake.acceptChallenge(message)));
      return;
    }
    if (message.type === "ready") {
      handshake.acceptReady();
      reconnectDelay = 1000;
      await setConnectionBadge("on", "#2367d1");
      return;
    }
    if (!handshake.authenticated) throw new Error("Relay is not authenticated");
    if (!message.id) throw new Error("Invalid relay message");
    const result = await execute(message.command);
    current.send(JSON.stringify({ id: message.id, ok: true, result }));
  } catch (error) {
    if (message?.id) {
      current.send(
        JSON.stringify({
          id: message.id,
          ok: false,
          error: errorMessage(error),
        }),
      );
    } else {
      current.close(1008, errorMessage(error).slice(0, 120));
    }
  }
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(connect, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 15_000);
}

async function connect() {
  clearTimeout(reconnectTimer);
  clearInterval(keepaliveTimer);
  const config = await options();
  if (!config.token) {
    await setConnectionBadge("!", "#b45309");
    return;
  }
  socket?.close();
  const handshake = createRelayHandshake(config.token);
  const current = new WebSocket(`ws://127.0.0.1:${config.port}/extension`);
  socket = current;
  current.addEventListener("open", () => {
    current.send(
      JSON.stringify({ type: "hello", clientNonce: handshake.clientNonce }),
    );
    keepaliveTimer = setInterval(() => {
      if (current.readyState === WebSocket.OPEN) {
        current.send(JSON.stringify({ type: "ping" }));
      }
    }, 20_000);
  });
  current.addEventListener("message", (event) => {
    void handleMessage(current, handshake, event);
  });
  current.addEventListener("close", async () => {
    if (socket !== current) return;
    socket = undefined;
    clearInterval(keepaliveTimer);
    await detachAll();
    await setConnectionBadge("", null);
    scheduleReconnect();
  });
  current.addEventListener("error", () => current.close());
}

chrome.action.onClicked.addListener(async (tab) => {
  await allowedTabsReady;
  if (!Number.isInteger(tab.id) || !isAttachable(tab.url)) return;
  if (allowedTabs.delete(tab.id)) {
    if (attachedTabs.delete(tab.id)) {
      await chrome.debugger.detach({ tabId: tab.id }).catch(() => undefined);
    }
    await setTabBadge(tab.id, false);
  } else {
    allowedTabs.add(tab.id);
    await setTabBadge(tab.id, true);
  }
  await saveAllowedTabs();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  attachedTabs.delete(tabId);
  if (allowedTabs.delete(tabId)) void saveAllowedTabs();
});
chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId !== undefined) attachedTabs.delete(source.tabId);
});
chrome.storage.onChanged.addListener((_changes, area) => {
  if (area === "local") void connect();
});
chrome.runtime.onInstalled.addListener(() => chrome.runtime.openOptionsPage());
void connect();
