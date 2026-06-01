/**
 * Tests for the browser WebSocket adapter.
 *
 * Since the browser adapter uses the native WebSocket global (which doesn't
 * exist in Node), we mock it to test the adapter functions in isolation.
 * This verifies the browser-specific code paths: header rejection,
 * socketSend try/catch, event listener normalization, etc.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the browser WebSocket global before importing the adapter
class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  url: string;
  protocols: string | string[] | undefined;
  readyState = MockWebSocket.OPEN;
  binaryType = "blob";

  private listeners = new Map<string, Set<Function>>();

  constructor(url: string | URL, protocols?: string | string[]) {
    this.url = String(url);
    this.protocols = protocols;
  }

  send = vi.fn();
  close = vi.fn();

  addEventListener(type: string, fn: Function, opts?: { once?: boolean }) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    if (opts?.once) {
      const wrapped = (...args: unknown[]) => {
        this.listeners.get(type)?.delete(wrapped);
        fn(...args);
      };
      this.listeners.get(type)!.add(wrapped);
    } else {
      this.listeners.get(type)!.add(fn);
    }
  }

  removeEventListener(type: string, fn: Function) {
    this.listeners.get(type)?.delete(fn);
  }

  emit(type: string, event: unknown) {
    this.listeners.get(type)?.forEach((fn) => fn(event));
  }
}

// Polyfill globals for the browser adapter
(globalThis as any).WebSocket = MockWebSocket;
(globalThis as any).CloseEvent = class CloseEvent {
  code: number;
  reason: string;
  wasClean: boolean;
  constructor(
    _type: string,
    init: { code: number; reason: string; wasClean: boolean },
  ) {
    this.code = init.code;
    this.reason = init.reason;
    this.wasClean = init.wasClean;
  }
};
(globalThis as any).MessageEvent = class MessageEvent {
  data: unknown;
  constructor(_type: string, init: { data: unknown }) {
    this.data = init.data;
  }
};

// Import the browser adapter after setting up globals
const adapter = await import("../src/ws/websocket-browser");

describe("browser WebSocket adapter", () => {
  describe("createWebSocket", () => {
    it("creates a WebSocket with url and protocols", () => {
      const ws = adapter.createWebSocket("ws://example.com", {
        protocols: ["proto1", "proto2"],
      });
      expect(ws.url).toBe("ws://example.com");
      expect(ws.protocols).toEqual(["proto1", "proto2"]);
    });

    it("creates a WebSocket without options", () => {
      const ws = adapter.createWebSocket("ws://example.com");
      expect(ws.url).toBe("ws://example.com");
    });

    it("throws when headers are provided", () => {
      expect(() =>
        adapter.createWebSocket("ws://example.com", {
          headers: { Authorization: "Bearer token" },
        }),
      ).toThrow(/headers.*not supported.*browser/i);
    });
  });

  describe("socketSend", () => {
    it("sends data when socket is open", async () => {
      const ws = new MockWebSocket("ws://example.com");
      ws.readyState = MockWebSocket.OPEN;

      await adapter.socketSend(ws as any, "hello");
      expect(ws.send).toHaveBeenCalledWith("hello");
    });

    it("rejects when socket is not open", async () => {
      const ws = new MockWebSocket("ws://example.com");
      ws.readyState = MockWebSocket.CLOSED;

      await expect(adapter.socketSend(ws as any, "hello")).rejects.toThrow(
        /not open/,
      );
    });

    it("catches synchronous send() throws and returns rejected promise", async () => {
      const ws = new MockWebSocket("ws://example.com");
      ws.readyState = MockWebSocket.OPEN;
      ws.send.mockImplementation(() => {
        throw new Error("InvalidStateError");
      });

      await expect(adapter.socketSend(ws as any, "data")).rejects.toThrow(
        "InvalidStateError",
      );
    });
  });

  describe("setBinaryType", () => {
    it("sets binaryType to arraybuffer", () => {
      const ws = new MockWebSocket("ws://example.com");
      expect(ws.binaryType).toBe("blob");
      adapter.setBinaryType(ws as any);
      expect(ws.binaryType).toBe("arraybuffer");
    });
  });

  describe("attachListeners", () => {
    let ws: MockWebSocket;
    let onOpen: ReturnType<typeof vi.fn>;
    let onMessage: ReturnType<typeof vi.fn>;
    let onClose: ReturnType<typeof vi.fn>;
    let onError: ReturnType<typeof vi.fn>;
    let removeListeners: () => void;

    beforeEach(() => {
      ws = new MockWebSocket("ws://example.com");
      onOpen = vi.fn();
      onMessage = vi.fn();
      onClose = vi.fn();
      onError = vi.fn();
      removeListeners = adapter.attachListeners(
        ws as any,
        onOpen,
        onMessage,
        onClose,
        onError,
      );
    });

    afterEach(() => {
      removeListeners();
    });

    it("calls onOpen when open event fires", () => {
      ws.emit("open", {});
      expect(onOpen).toHaveBeenCalledOnce();
    });

    it("calls onMessage with string data", () => {
      ws.emit("message", { data: "hello" });
      expect(onMessage).toHaveBeenCalledWith("hello", false);
    });

    it("calls onMessage with binary data (ArrayBuffer)", () => {
      const buf = new ArrayBuffer(4);
      ws.emit("message", { data: buf });
      expect(onMessage).toHaveBeenCalledWith(buf, true);
    });

    it("calls onClose with code, reason, wasClean", () => {
      ws.emit("close", { code: 1000, reason: "done", wasClean: true });
      expect(onClose).toHaveBeenCalledWith(1000, "done", true);
    });

    it("calls onError with an Error", () => {
      ws.emit("error", {});
      expect(onError).toHaveBeenCalledOnce();
      expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    });

    it("removeListeners stops events from firing", () => {
      removeListeners();
      ws.emit("open", {});
      ws.emit("message", { data: "ignored" });
      expect(onOpen).not.toHaveBeenCalled();
      expect(onMessage).not.toHaveBeenCalled();
    });
  });

  describe("socketClose", () => {
    it("calls close on the socket", () => {
      const ws = new MockWebSocket("ws://example.com");
      adapter.socketClose(ws as any, 1000, "bye");
      expect(ws.close).toHaveBeenCalledWith(1000, "bye");
    });
  });
});
