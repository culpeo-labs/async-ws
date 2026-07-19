import {
  WebSocket as WS,
  type MessageEvent as WSMessageEvent,
  type CloseEvent as WSCloseEvent,
  type ErrorEvent as WSErrorEvent,
} from "ws";
import type { ConnectOptions } from "../types";

export type { WSMessageEvent, WSCloseEvent, WSErrorEvent };

export type Socket = WS;

export function createWebSocket(
  url: string | URL,
  options?: ConnectOptions,
): Socket {
  return new WS(url, options?.protocols, {
    headers: options?.headers,
  });
}

export function socketSend(
  socket: Socket,
  data: string | ArrayBuffer | ArrayBufferView,
): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.send(data, (error?: Error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

export function getReadyState(socket: Socket): number {
  return socket.readyState;
}

/**
 * Normalize a `ws` error event into an `Error` with a stable, non-empty,
 * prefixed message. The underlying error's `message` is not guaranteed to be
 * populated consistently across platforms/Node versions — e.g. Node's Happy
 * Eyeballs algorithm can surface an `AggregateError` whose top-level
 * `message` is empty even though its nested `errors` have details.
 */
function toTransportError(event: WSErrorEvent): Error {
  const err: unknown = event.error;
  let detail = event.message;

  if (!detail && err instanceof Error) {
    detail = err.message;
  }

  if (!detail && err && typeof err === "object" && "errors" in err) {
    const nested = (err as { errors?: unknown }).errors;
    if (Array.isArray(nested) && nested.length > 0) {
      detail = nested
        .map((e) => (e instanceof Error ? e.message : String(e)))
        .join("; ");
    }
  }

  return new Error(
    detail
      ? `WebSocket transport error: ${detail}`
      : "WebSocket transport error",
  );
}

export function setBinaryType(socket: Socket): void {
  socket.binaryType = "arraybuffer";
}

export function attachListeners(
  socket: Socket,
  onOpen: () => void,
  onMessage: (data: string | ArrayBuffer, binary: boolean) => void,
  onClose: (code: number, reason: string, wasClean: boolean) => void,
  onError: (error: Error) => void,
): () => void {
  const handleOpen = () => onOpen();
  const handleMessage = (event: WSMessageEvent) => {
    const isBinary = !(typeof event.data === "string");
    let data: string | ArrayBuffer;
    if (isBinary) {
      if (event.data instanceof ArrayBuffer) {
        data = event.data;
      } else if (Buffer.isBuffer(event.data)) {
        const buf = event.data;
        data = buf.buffer.slice(
          buf.byteOffset,
          buf.byteOffset + buf.byteLength,
        ) as ArrayBuffer;
      } else if (Array.isArray(event.data)) {
        const buf = Buffer.concat(event.data);
        data = buf.buffer.slice(
          buf.byteOffset,
          buf.byteOffset + buf.byteLength,
        ) as ArrayBuffer;
      } else {
        data = event.data as unknown as ArrayBuffer;
      }
    } else {
      data = event.data as string;
    }
    onMessage(data, isBinary);
  };
  const handleClose = (event: WSCloseEvent) =>
    onClose(event.code, event.reason, event.wasClean);
  const handleError = (event: WSErrorEvent) => onError(toTransportError(event));

  socket.addEventListener("open", handleOpen);
  socket.addEventListener("message", handleMessage);
  socket.addEventListener("close", handleClose);
  socket.addEventListener("error", handleError);

  return () => {
    socket.removeEventListener("open", handleOpen);
    socket.removeEventListener("message", handleMessage);
    socket.removeEventListener("close", handleClose);
    socket.removeEventListener("error", handleError);
  };
}

export function socketClose(
  socket: Socket,
  code?: number,
  reason?: string,
): void {
  socket.close(code, reason);
}

export function socketTerminate(socket: Socket): void {
  socket.terminate();
}

export function socketPing(socket: Socket): void {
  socket.ping();
}

export function attachPongListener(
  socket: Socket,
  onPong: () => void,
): () => void {
  const handler = () => onPong();
  socket.on("pong", handler);
  return () => socket.off("pong", handler);
}

export function adoptSocket(rawSocket: unknown): Socket {
  const s = rawSocket as Record<string, unknown>;
  if (
    !s ||
    typeof s !== "object" ||
    typeof s.send !== "function" ||
    typeof s.close !== "function" ||
    typeof s.addEventListener !== "function" ||
    typeof s.removeEventListener !== "function"
  ) {
    throw new Error(
      "Expected a WebSocket-compatible object (must have send, close, addEventListener, removeEventListener).",
    );
  }
  if ((s as { readyState?: unknown }).readyState !== WS.OPEN) {
    throw new Error(
      "Socket must be in the OPEN state to be adopted. " +
        "Call fromSocket() immediately in the server's connection handler.",
    );
  }
  return rawSocket as Socket;
}

export const supportsPing = true;

export const OPEN = WS.OPEN;
