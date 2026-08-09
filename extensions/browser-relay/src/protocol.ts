export interface BrowserTab {
  id: number;
  windowId: number;
  active: boolean;
  title: string;
  url: string;
}

export type RelayCommand =
  | { action: "tabs" }
  | { action: "newTab"; url: string }
  | { action: "navigate"; tabId: number; url: string }
  | { action: "activateTab"; tabId: number }
  | { action: "closeTab"; tabId: number }
  | {
      action: "events";
      tabId: number;
      methodPrefix?: string;
      limit?: number;
      clear?: boolean;
    }
  | {
      action: "cdp";
      tabId: number;
      method: string;
      params?: Record<string, unknown>;
    };

export interface RelayRequest {
  id: string;
  command: RelayCommand;
}

export type RelayResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string };

export interface RelayHealth {
  name: "pi-browser-relay";
  version: 2;
  connected: boolean;
  proof: string;
}
