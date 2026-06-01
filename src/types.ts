/** Options for connecting to a WebSocket server. */
export interface ConnectOptions {
  /** Subprotocols to request. */
  protocols?: string | string[];
  /** HTTP headers to send during the handshake (Node.js only). */
  headers?: Record<string, string>;
}

/** Represents a received WebSocket message. */
export interface WebSocketMessage {
  /** The message payload. */
  data: string | ArrayBuffer;
  /** Whether the payload is binary data. */
  binary: boolean;
}

/** Information about a WebSocket close event. */
export interface WebSocketCloseInfo {
  /** The close code. */
  code: number;
  /** The close reason string. */
  reason: string;
  /** Whether the close handshake completed cleanly. */
  wasClean: boolean;
}

export type WebSocketState =
  | "idle"
  | "connecting"
  | "open"
  | "closing"
  | "closed"
  | "errored";
