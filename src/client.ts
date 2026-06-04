import type {
  ConnectOptions,
  ClientOptions,
  WebSocketMessage,
  WebSocketCloseInfo,
  WebSocketState,
} from "./types";
import {
  createWebSocket,
  adoptSocket,
  socketSend,
  socketClose,
  socketTerminate,
  socketPing,
  attachPongListener,
  supportsPing,
  setBinaryType,
  attachListeners,
  OPEN,
  type Socket,
} from "./ws/websocket";

interface Waiter {
  resolve: (msg: WebSocketMessage) => void;
  reject: (err: Error) => void;
}

/**
 * Imperative WebSocket client that works in both browser and Node.js.
 *
 * Turns the event-driven WebSocket API into a promise-based one:
 * - `connect(url)` returns a promise that resolves when the connection opens.
 * - `send(data)` returns a promise that resolves when the data is accepted.
 * - `receive()` returns a promise that resolves with the next message.
 * - `close()` returns a promise that resolves when the connection closes.
 * - Supports `for await...of` iteration over incoming messages.
 */
export class WebSocketClient {
  private socket: Socket | null = null;
  private state: WebSocketState = "idle";
  private buffer: WebSocketMessage[] = [];
  private waiters: Waiter[] = [];
  private terminalError: Error | null = null;
  private closeInfo: WebSocketCloseInfo | null = null;
  private removeListeners: (() => void) | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private removePongListener: (() => void) | null = null;
  private connectionId = 0;
  private readonly maxBufferSize: number;
  private readonly keepAliveConfig: ClientOptions["keepAlive"];

  constructor(options?: ClientOptions) {
    this.maxBufferSize = options?.maxBufferSize ?? 0;
    if (options?.keepAlive) {
      if (!supportsPing) {
        throw new Error(
          "keepAlive is not supported in browsers. " +
            "The browser handles WebSocket ping/pong at the protocol level automatically.",
        );
      }
      if (options.keepAlive.interval <= 0) {
        throw new Error("keepAlive.interval must be greater than 0.");
      }
      if (
        options.keepAlive.timeout !== undefined &&
        options.keepAlive.timeout <= 0
      ) {
        throw new Error("keepAlive.timeout must be greater than 0.");
      }
      this.keepAliveConfig = options.keepAlive;
    }
  }

  /**
   * Adopt an already-open WebSocket (e.g. from a `WebSocketServer` connection event).
   *
   * Returns a `WebSocketClient` in the "open" state, ready to send/receive.
   * The client takes ownership of the socket lifecycle: calling `close()`
   * will close the underlying socket.
   *
   * **Node.js only.** Throws in browser builds.
   *
   * Call this immediately in the server's `connection` handler to avoid
   * missing messages:
   *
   * ```ts
   * wss.on("connection", (socket) => {
   *   const client = WebSocketClient.fromSocket(socket);
   *   const msg = await client.receive();
   * });
   * ```
   */
  static fromSocket(
    rawSocket: unknown,
    options?: ClientOptions,
  ): WebSocketClient {
    const client = new WebSocketClient(options);
    const socket = adoptSocket(rawSocket);

    client.socket = socket;
    setBinaryType(socket);
    client.state = "open";
    const currentConnectionId = ++client.connectionId;

    client.removeListeners = attachListeners(
      socket,
      // onOpen — already open, won't fire
      () => {},
      // onMessage
      (data, binary) => {
        client.enqueueMessage({ data, binary });
      },
      // onClose
      (code, reason, wasClean) => {
        if (currentConnectionId !== client.connectionId) return;

        client.closeInfo = { code, reason, wasClean };
        client.state = "closed";
        client.cleanup();

        if (client.buffer.length === 0) {
          client.rejectAllWaiters(
            new Error(`WebSocket closed (code: ${code}, reason: ${reason})`),
          );
        }
      },
      // onError
      (error) => {
        if (currentConnectionId !== client.connectionId) return;

        client.terminalError = error;
        client.rejectAllWaiters(error);
      },
    );

    client.startKeepAlive();
    return client;
  }

  /** Current connection state. */
  get readyState(): WebSocketState {
    return this.state;
  }

  /** Close info from the last close event, if any. */
  get lastCloseInfo(): WebSocketCloseInfo | null {
    return this.closeInfo;
  }

  /** The negotiated subprotocol, or empty string if none. */
  get protocol(): string {
    return this.socket?.protocol ?? "";
  }

  /** The URL of the WebSocket connection. */
  get url(): string {
    return this.socket?.url ?? "";
  }

  /** The number of bytes of data queued for sending. */
  get bufferedAmount(): number {
    return this.socket?.bufferedAmount ?? 0;
  }

  /** The extensions negotiated by the server. */
  get extensions(): string {
    return this.socket?.extensions ?? "";
  }

  /**
   * Connect to a WebSocket server.
   * Resolves when the connection is open. Rejects on error.
   */
  connect(url: string | URL, options?: ConnectOptions): Promise<void> {
    if (
      this.state !== "idle" &&
      this.state !== "closed" &&
      this.state !== "errored"
    ) {
      return Promise.reject(
        new Error(`Cannot connect: client is in "${this.state}" state`),
      );
    }

    if (options?.timeout !== undefined && options.timeout <= 0) {
      return Promise.reject(new Error("timeout must be greater than 0."));
    }

    if (options?.signal?.aborted) {
      return Promise.reject(new Error("Connection aborted."));
    }

    this.reset();
    this.state = "connecting";
    const currentConnectionId = ++this.connectionId;

    return new Promise<void>((resolve, reject) => {
      try {
        this.socket = createWebSocket(url, options);
        setBinaryType(this.socket);
      } catch (err) {
        this.state = "errored";
        this.terminalError =
          err instanceof Error ? err : new Error(String(err));
        reject(this.terminalError);
        return;
      }

      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const settle = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        if (options?.signal) {
          options.signal.removeEventListener("abort", onAbort);
        }
        fn();
      };

      const onAbort = () => {
        settle(() => {
          this.state = "closed";
          this.terminalError = new Error("Connection aborted.");
          if (this.socket) {
            socketTerminate(this.socket);
          }
          // Don't call cleanup() here — socketTerminate() emits
          // error/close asynchronously; let onClose handle cleanup.
          reject(this.terminalError);
        });
      };

      if (options?.timeout !== undefined) {
        timeoutId = setTimeout(() => {
          settle(() => {
            this.state = "closed";
            this.terminalError = new Error(
              `Connection timed out after ${options.timeout}ms.`,
            );
            if (this.socket) {
              socketTerminate(this.socket);
            }
            // Don't call cleanup() here — socketTerminate() emits
            // error/close asynchronously; let onClose handle cleanup.
            reject(this.terminalError);
          });
        }, options.timeout);
      }

      if (options?.signal) {
        options.signal.addEventListener("abort", onAbort, { once: true });
      }

      this.removeListeners = attachListeners(
        this.socket,
        // onOpen
        () => {
          settle(() => {
            this.state = "open";
            this.startKeepAlive();
            resolve();
          });
        },
        // onMessage
        (data, binary) => {
          this.enqueueMessage({ data, binary });
        },
        // onClose
        (code, reason, wasClean) => {
          // Ignore close events from a stale connection (e.g., after
          // timeout/abort triggered a reconnect on the same client).
          if (currentConnectionId !== this.connectionId) return;

          this.closeInfo = { code, reason, wasClean };
          this.state = "closed";
          this.cleanup();

          settle(() => {
            reject(
              new Error(
                `WebSocket closed before opening (code: ${code}, reason: ${reason})`,
              ),
            );
          });

          // Only reject pending waiters once buffer is drained
          if (this.buffer.length === 0) {
            this.rejectAllWaiters(
              new Error(`WebSocket closed (code: ${code}, reason: ${reason})`),
            );
          }
        },
        // onError
        (error) => {
          // Ignore error events from a stale connection.
          if (currentConnectionId !== this.connectionId) return;

          this.terminalError = error;
          settle(() => {
            reject(error);
          });
          // Reject any pending receive() waiters immediately
          this.rejectAllWaiters(error);
          // Don't call cleanup() here — per spec, a close event always
          // follows an error event. Let onClose handle state transition
          // and listener removal.
        },
      );
    });
  }

  /**
   * Send data over the WebSocket.
   * Resolves when the data has been accepted by the socket.
   */
  send(data: string | ArrayBuffer | ArrayBufferView): Promise<void> {
    if (this.state !== "open" || !this.socket) {
      return Promise.reject(
        new Error(`Cannot send: client is in "${this.state}" state`),
      );
    }
    return socketSend(this.socket, data);
  }

  /**
   * Wait for and return the next incoming message.
   *
   * If messages have been buffered, returns the oldest one immediately.
   * If the socket has closed cleanly and the buffer is empty, rejects.
   */
  receive(): Promise<WebSocketMessage> {
    // Drain buffer first, even if the socket is closed
    if (this.buffer.length > 0) {
      return Promise.resolve(this.buffer.shift()!);
    }

    if (this.state === "errored" && this.terminalError) {
      return Promise.reject(this.terminalError);
    }

    if (this.state === "closed") {
      return Promise.reject(new Error("WebSocket is closed"));
    }

    if (this.state !== "open") {
      return Promise.reject(
        new Error(`Cannot receive: client is in "${this.state}" state`),
      );
    }

    return new Promise<WebSocketMessage>((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }

  /**
   * Close the WebSocket connection.
   * Resolves when the close handshake completes.
   */
  close(code?: number, reason?: string): Promise<void> {
    if (
      this.state === "closed" ||
      this.state === "idle" ||
      this.state === "errored"
    ) {
      return Promise.resolve();
    }

    if (!this.socket) {
      return Promise.resolve();
    }

    if (this.state === "closing") {
      // Already closing — wait for the close event via a one-shot listener
      return new Promise<void>((resolve) => {
        if (this.socket) {
          this.socket.addEventListener("close", () => resolve(), {
            once: true,
          });
        } else {
          resolve();
        }
      });
    }

    this.state = "closing";

    // Validate close code before calling socketClose to avoid leaving the
    // socket in a corrupt state (ws library sets readyState to CLOSING
    // before throwing on invalid codes, making the socket unrecoverable).
    if (code !== undefined) {
      if (code !== 1000 && (code < 3000 || code > 4999)) {
        this.state = "open";
        return Promise.reject(
          new Error(
            `Invalid close code: ${code}. Must be 1000 or in range 3000-4999.`,
          ),
        );
      }
    }

    return new Promise<void>((resolve) => {
      if (this.socket) {
        this.socket.addEventListener("close", () => resolve(), { once: true });
      }

      socketClose(this.socket!, code, reason);
    });
  }

  /**
   * Async iterator over incoming messages.
   *
   * - Yields messages as they arrive.
   * - Returns (ends iteration) on normal close.
   * - Throws on error/abnormal close.
   * - If the consumer `break`s, the socket is NOT closed automatically.
   */
  async *[Symbol.asyncIterator](): AsyncGenerator<WebSocketMessage> {
    while (true) {
      try {
        yield await this.receive();
      } catch {
        // If closed cleanly, end iteration
        if (this.state === "closed" && this.closeInfo?.wasClean) {
          return;
        }
        // Otherwise, propagate the error
        throw this.terminalError ?? new Error("WebSocket closed unexpectedly");
      }
    }
  }

  private enqueueMessage(msg: WebSocketMessage): void {
    if (this.waiters.length > 0) {
      const waiter = this.waiters.shift()!;
      waiter.resolve(msg);
    } else {
      if (this.maxBufferSize > 0 && this.buffer.length >= this.maxBufferSize) {
        this.buffer.shift(); // drop oldest
      }
      this.buffer.push(msg);
    }
  }

  private rejectAllWaiters(error: Error): void {
    const pending = this.waiters.splice(0);
    for (const waiter of pending) {
      waiter.reject(error);
    }
  }

  private startKeepAlive(): void {
    if (!this.keepAliveConfig || !this.socket) return;

    const { interval, timeout } = this.keepAliveConfig;
    const pongTimeout = timeout ?? interval;

    this.removePongListener = attachPongListener(this.socket, () => {
      if (this.pongTimer !== null) {
        clearTimeout(this.pongTimer);
        this.pongTimer = null;
      }
    });

    this.keepAliveTimer = setInterval(() => {
      if (this.state !== "open" || !this.socket) return;

      socketPing(this.socket);

      // Clear any existing pong watchdog before starting a new one
      // to prevent multiple timers when timeout > interval.
      if (this.pongTimer !== null) {
        clearTimeout(this.pongTimer);
      }

      this.pongTimer = setTimeout(() => {
        if (this.state === "open" && this.socket) {
          this.terminalError = new Error(
            `Keep-alive timeout: no pong received within ${pongTimeout}ms.`,
          );
          socketTerminate(this.socket);
        }
      }, pongTimeout);
    }, interval);
  }

  private stopKeepAlive(): void {
    if (this.keepAliveTimer !== null) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    if (this.pongTimer !== null) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
    if (this.removePongListener) {
      this.removePongListener();
      this.removePongListener = null;
    }
  }

  private cleanup(): void {
    this.stopKeepAlive();
    if (this.removeListeners) {
      this.removeListeners();
      this.removeListeners = null;
    }
    this.socket = null;
  }

  private reset(): void {
    this.socket = null;
    this.buffer = [];
    this.waiters = [];
    this.terminalError = null;
    this.closeInfo = null;
    this.removeListeners = null;
    this.stopKeepAlive();
  }
}
