const DEFAULT_MAX_EVENTS = 1000;
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

export class RelayEventBuffer {
  #maxEvents;
  #maxBytes;
  #tabs = new Map();

  constructor({
    maxEvents = DEFAULT_MAX_EVENTS,
    maxBytes = DEFAULT_MAX_BYTES,
  } = {}) {
    this.#maxEvents = maxEvents;
    this.#maxBytes = maxBytes;
  }

  push(tabId, method, params) {
    const event = { method, params, timestamp: Date.now() };
    const bytes = JSON.stringify(event).length;
    const state = this.#tabs.get(tabId) ?? {
      entries: [],
      bytes: 0,
      dropped: 0,
    };
    state.entries.push({ event, bytes });
    state.bytes += bytes;
    while (
      state.entries.length > this.#maxEvents ||
      state.bytes > this.#maxBytes
    ) {
      const removed = state.entries.shift();
      if (!removed) break;
      state.bytes -= removed.bytes;
      state.dropped += 1;
    }
    this.#tabs.set(tabId, state);
  }

  drain(tabId, { methodPrefix = "", limit = 100, clear = true } = {}) {
    const state = this.#tabs.get(tabId) ?? {
      entries: [],
      bytes: 0,
      dropped: 0,
    };
    const selected = [];
    const selectedIndexes = new Set();
    for (let index = 0; index < state.entries.length; index += 1) {
      const entry = state.entries[index];
      if (!entry.event.method.startsWith(methodPrefix)) continue;
      selected.push(entry.event);
      selectedIndexes.add(index);
      if (selected.length === limit) break;
    }
    const dropped = state.dropped;
    if (clear) {
      state.entries = state.entries.filter(
        (_entry, index) => !selectedIndexes.has(index),
      );
      state.bytes = state.entries.reduce((sum, entry) => sum + entry.bytes, 0);
      state.dropped = 0;
    }
    if (state.entries.length === 0 && state.dropped === 0) {
      this.#tabs.delete(tabId);
    } else {
      this.#tabs.set(tabId, state);
    }
    return { events: selected, dropped, pending: state.entries.length };
  }

  clear(tabId) {
    this.#tabs.delete(tabId);
  }

  clearAll() {
    this.#tabs.clear();
  }
}
