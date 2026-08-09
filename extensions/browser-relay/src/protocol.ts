export interface BrowserTab {
  id: number;
  windowId: number;
  active: boolean;
  title: string;
  url: string;
}

export type RelayCommand =
  | { action: "tabs" }
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
  version: 1;
  connected: boolean;
  proof: string;
}
