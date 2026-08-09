export interface RelayHandshake {
  readonly clientNonce: string;
  readonly authenticated: boolean;
  acceptChallenge(message: {
    serverNonce?: unknown;
    serverProof?: unknown;
  }): Promise<{ type: "authenticate"; clientProof: string }>;
  acceptReady(): void;
}

export function createRelayHandshake(token: string): RelayHandshake;
