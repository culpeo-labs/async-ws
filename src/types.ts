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

/** Options for the WebSocketClient constructor. */
export interface ClientOptions {
  /**
   * Maximum number of messages to buffer before a consumer calls `receive()`.
   * When the buffer is full, the oldest message is dropped.
   * Set to 0 for unlimited. Defaults to 0 (unlimited).
   */
  maxBufferSize?: number;
}

export type WebSocketState =
  | "idle"
  | "connecting"
  | "open"
  | "closing"
  | "closed"
  | "errored";
