export interface RelayDebuggerEvent {
  method: string;
  params: unknown;
  timestamp: number;
}

export interface RelayEventDrain {
  events: RelayDebuggerEvent[];
  dropped: number;
  pending: number;
}

export class RelayEventBuffer {
  constructor(options?: { maxEvents?: number; maxBytes?: number });
  push(tabId: number, method: string, params: unknown): void;
  drain(
    tabId: number,
    options?: { methodPrefix?: string; limit?: number; clear?: boolean },
  ): RelayEventDrain;
  clear(tabId: number): void;
  clearAll(): void;
}
