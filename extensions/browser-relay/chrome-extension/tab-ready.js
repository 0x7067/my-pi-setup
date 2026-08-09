const POLL_INTERVAL_MS = 25;
const TIMEOUT_MS = 5_000;

export async function waitForCommittedTab(tabs, tabId, isAttachable) {
  const deadline = Date.now() + TIMEOUT_MS;
  while (true) {
    const tab = await tabs.get(tabId);
    if (isAttachable(tab.url) && !isAttachable(tab.pendingUrl)) return tab;
    if (Date.now() >= deadline) {
      throw new Error(`Tab ${tabId} did not commit an attachable URL`);
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}
