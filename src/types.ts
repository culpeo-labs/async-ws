/** Options for connecting to a WebSocket server. */
export interface ConnectOptions {
  /** Subprotocols to request. */
  protocols?: string | string[];
  /** HTTP headers to send during the handshake (Node.js only). */
  headers?: Record<string, string>;
  /**
   * Connection timeout in milliseconds.
   * If the connection is not established within this time, it is aborted.
   * Default: no timeout.
   */
  timeout?: number;
  /**
   * An AbortSignal to cancel the connection attempt.
   * If aborted, the connection is terminated and connect() rejects.
   */
  signal?: AbortSignal;
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
  /**
   * Enable automatic keep-alive pings (Node.js only).
   * In browsers, this option throws because the browser handles
   * ping/pong at the protocol level automatically.
   */
  keepAlive?: KeepAliveOptions;
}

/** Configuration for automatic keep-alive pings (Node.js only). */
export interface KeepAliveOptions {
  /** Interval in milliseconds between pings. Must be > 0. */
  interval: number;
  /**
   * Time in milliseconds to wait for a pong response before
   * terminating the connection. Default: same as interval.
   */
  timeout?: number;
}

export type WebSocketState =
  | "idle"
  | "connecting"
  | "open"
  | "closing"
  | "closed"
  | "errored";
