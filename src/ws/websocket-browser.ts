import type { ConnectOptions } from "../types";

type _WS = WebSocket;
const _WS = WebSocket;

export type Socket = _WS;

export function createWebSocket(
  url: string | URL,
  options?: ConnectOptions,
): Socket {
  if (options?.headers != null) {
    throw new Error(
      "Custom headers are not supported in the browser. Use subprotocols or query parameters instead.",
    );
  }
  return new _WS(url, options?.protocols);
}

export function socketSend(
  socket: Socket,
  data: string | ArrayBuffer | ArrayBufferView,
): Promise<void> {
  if (socket.readyState !== _WS.OPEN) {
    return Promise.reject(new Error("WebSocket is not open"));
  }
  try {
    if (ArrayBuffer.isView(data)) {
      if (data.buffer instanceof SharedArrayBuffer) {
        throw new Error(
          "SharedArrayBuffer-backed views are not supported. " +
            "Copy into a regular ArrayBuffer before sending.",
        );
      }
      // Zero-copy: create a Uint8Array view over the same ArrayBuffer
      socket.send(
        new Uint8Array(
          data.buffer as ArrayBuffer,
          data.byteOffset,
          data.byteLength,
        ),
      );
    } else {
      socket.send(data);
    }
    return Promise.resolve();
  } catch (err) {
    return Promise.reject(err instanceof Error ? err : new Error(String(err)));
  }
}

export function getReadyState(socket: Socket): number {
  return socket.readyState;
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
  const handleMessage = (event: MessageEvent) => {
    const isBinary = event.data instanceof ArrayBuffer;
    onMessage(event.data, isBinary);
  };
  const handleClose = (event: CloseEvent) =>
    onClose(event.code, event.reason, event.wasClean);
  const handleError = () => onError(new Error("WebSocket error"));

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
  socket.close();
}

export function socketPing(_socket: Socket): void {
  throw new Error("Ping is not supported in browsers.");
}

export function attachPongListener(
  _socket: Socket,
  _onPong: () => void,
): () => void {
  return () => {};
}

export function adoptSocket(_rawSocket: unknown): Socket {
  throw new Error(
    "fromSocket() is not supported in browsers. " +
      "Browsers cannot accept server-side WebSocket connections.",
  );
}

export const supportsPing = false;

export const OPEN = _WS.OPEN;
