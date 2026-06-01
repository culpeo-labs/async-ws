import type {
  ConnectOptions,
  WebSocketMessage,
  WebSocketCloseInfo,
  WebSocketState,
} from "./types";
import {
  createWebSocket,
  socketSend,
  socketClose,
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

  /** Current connection state. */
  get readyState(): WebSocketState {
    return this.state;
  }

  /** Close info from the last close event, if any. */
  get lastCloseInfo(): WebSocketCloseInfo | null {
    return this.closeInfo;
  }

  /**
   * Connect to a WebSocket server.
   * Resolves when the connection is open. Rejects on error.
   */
  connect(url: string | URL, options?: ConnectOptions): Promise<void> {
    if (this.state !== "idle" && this.state !== "closed" && this.state !== "errored") {
      return Promise.reject(
        new Error(`Cannot connect: client is in "${this.state}" state`),
      );
    }

    this.reset();
    this.state = "connecting";

    return new Promise<void>((resolve, reject) => {
      try {
        this.socket = createWebSocket(url, options);
        setBinaryType(this.socket);
      } catch (err) {
        this.state = "errored";
        this.terminalError = err instanceof Error ? err : new Error(String(err));
        reject(this.terminalError);
        return;
      }

      let settled = false;

      this.removeListeners = attachListeners(
        this.socket,
        // onOpen
        () => {
          if (!settled) {
            settled = true;
            this.state = "open";
            resolve();
          }
        },
        // onMessage
        (data, binary) => {
          this.enqueueMessage({ data, binary });
        },
        // onClose
        (code, reason, wasClean) => {
          this.closeInfo = { code, reason, wasClean };
          const prevState = this.state;
          this.state = "closed";
          this.cleanup();

          if (!settled) {
            settled = true;
            reject(
              new Error(
                `WebSocket closed before opening (code: ${code}, reason: ${reason})`,
              ),
            );
          }

          // Only reject pending waiters once buffer is drained
          if (this.buffer.length === 0) {
            this.rejectAllWaiters(
              new Error(
                `WebSocket closed (code: ${code}, reason: ${reason})`,
              ),
            );
          }
        },
        // onError
        (error) => {
          this.terminalError = error;
          if (!settled) {
            settled = true;
            this.state = "errored";
            this.cleanup();
            reject(error);
          }
          // If already open, mark errored and reject waiters
          if (this.state === "open" || this.state === "connecting") {
            this.state = "errored";
            this.cleanup();
            this.rejectAllWaiters(error);
          }
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
      return Promise.reject(
        new Error("WebSocket is closed"),
      );
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
    if (this.state === "closed" || this.state === "idle") {
      return Promise.resolve();
    }

    if (!this.socket) {
      return Promise.resolve();
    }

    if (this.state === "closing") {
      // Already closing — return a promise that resolves when closed
      return new Promise<void>((resolve) => {
        const check = () => {
          if (this.state === "closed") {
            resolve();
          } else {
            setTimeout(check, 10);
          }
        };
        check();
      });
    }

    this.state = "closing";

    return new Promise<void>((resolve) => {
      const origRemove = this.removeListeners;

      // Attach a one-shot close listener
      const onCloseForShutdown = () => {
        resolve();
      };

      if (this.socket) {
        this.socket.addEventListener("close", onCloseForShutdown);
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
      this.buffer.push(msg);
    }
  }

  private rejectAllWaiters(error: Error): void {
    const pending = this.waiters.splice(0);
    for (const waiter of pending) {
      waiter.reject(error);
    }
  }

  private cleanup(): void {
    if (this.removeListeners) {
      this.removeListeners();
      this.removeListeners = null;
    }
  }

  private reset(): void {
    this.socket = null;
    this.buffer = [];
    this.waiters = [];
    this.terminalError = null;
    this.closeInfo = null;
    this.removeListeners = null;
  }
}
