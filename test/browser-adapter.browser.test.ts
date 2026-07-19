/**
 * Browser integration tests.
 *
 * These run inside Chromium via Playwright. The WebSocketClient uses the
 * browser adapter (swapped via alias) and connects to a real WebSocket
 * server started by globalSetup.
 */
import { describe, it, expect } from "vitest";
import { WebSocketClient } from "../src/index";

const WS_URL = "ws://localhost:18973";

describe("WebSocketClient (browser)", () => {
  describe("connect / send / receive", () => {
    it("connects, sends, and receives a text message", async () => {
      const client = new WebSocketClient();
      await client.connect(`${WS_URL}?mode=echo`);
      expect(client.readyState).toBe("open");

      await client.send("hello from browser");
      const msg = await client.receive();
      expect(msg.data).toBe("hello from browser");
      expect(msg.binary).toBe(false);

      await client.close();
    });

    it("receives binary data as ArrayBuffer", async () => {
      const client = new WebSocketClient();
      await client.connect(`${WS_URL}?mode=binary`);

      await client.send("ping");
      const msg = await client.receive();
      expect(msg.binary).toBe(true);
      expect(msg.data).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(msg.data as ArrayBuffer)).toEqual(
        new Uint8Array([1, 2, 3]),
      );

      await client.close();
    });

    it("can send ArrayBuffer data", async () => {
      const client = new WebSocketClient();
      await client.connect(`${WS_URL}?mode=echo`);

      const buf = new Uint8Array([10, 20, 30]).buffer;
      await client.send(buf);
      const msg = await client.receive();
      expect(msg.binary).toBe(true);

      await client.close();
    });

    it("can send ArrayBufferView (Uint8Array)", async () => {
      const client = new WebSocketClient();
      await client.connect(`${WS_URL}?mode=echo`);

      await client.send(new Uint8Array([4, 5, 6]));
      const msg = await client.receive();
      expect(msg.binary).toBe(true);

      await client.close();
    });

    it("can send a subarray view with correct offset/length", async () => {
      const client = new WebSocketClient();
      await client.connect(`${WS_URL}?mode=echo`);

      const full = new Uint8Array([10, 20, 30, 40, 50]);
      const sub = full.subarray(1, 4);
      await client.send(sub);
      const msg = await client.receive();
      expect(msg.binary).toBe(true);
      const received = new Uint8Array(msg.data as ArrayBuffer);
      expect(received).toEqual(new Uint8Array([20, 30, 40]));

      await client.close();
    });

    it("can send other typed arrays (Int32Array)", async () => {
      const client = new WebSocketClient();
      await client.connect(`${WS_URL}?mode=echo`);

      await client.send(new Int32Array([42]));
      const msg = await client.receive();
      expect(msg.binary).toBe(true);

      await client.close();
    });

    it("rejects SharedArrayBuffer-backed views", async () => {
      if (typeof SharedArrayBuffer === "undefined") {
        return; // not available without cross-origin isolation
      }

      const client = new WebSocketClient();
      await client.connect(`${WS_URL}?mode=echo`);

      const sab = new SharedArrayBuffer(4);
      const view = new Uint8Array(sab);
      await expect(client.send(view)).rejects.toThrow(
        /SharedArrayBuffer-backed views are not supported/,
      );

      await client.close();
    });
  });

  describe("close", () => {
    it("resolves and sets closeInfo on clean close", async () => {
      const client = new WebSocketClient();
      await client.connect(`${WS_URL}?mode=echo`);
      await client.close();

      expect(client.readyState).toBe("closed");
      expect(client.lastCloseInfo).not.toBeNull();
    });

    it("handles server-initiated close", async () => {
      const client = new WebSocketClient();
      await client.connect(`${WS_URL}?mode=close-immediately`);

      await expect(client.receive()).rejects.toThrow(/WebSocket closed/);
      expect(client.readyState).toBe("closed");
      expect(client.lastCloseInfo).not.toBeNull();
    });

    it("rejects with invalid close code", async () => {
      const client = new WebSocketClient();
      await client.connect(`${WS_URL}?mode=echo`);

      await expect(client.close(999)).rejects.toThrow(/Invalid close code/);
      await client.close();
    });

    it("resolves immediately when idle", async () => {
      const client = new WebSocketClient();
      await client.close();
      expect(client.readyState).toBe("idle");
    });
  });

  describe("message buffering", () => {
    it("buffers messages arriving before receive()", async () => {
      const client = new WebSocketClient();
      await client.connect(`${WS_URL}?mode=burst&count=3`);

      await new Promise((r) => setTimeout(r, 100));

      const m1 = await client.receive();
      const m2 = await client.receive();
      const m3 = await client.receive();
      expect(m1.data).toBe("msg0");
      expect(m2.data).toBe("msg1");
      expect(m3.data).toBe("msg2");

      await client.close();
    });

    it("drains buffered messages after close before rejecting", async () => {
      const client = new WebSocketClient();
      await client.connect(`${WS_URL}?mode=send-then-close`);

      await new Promise((r) => setTimeout(r, 100));

      const msg = await client.receive();
      expect(msg.data).toBe("last-msg");

      await expect(client.receive()).rejects.toThrow(/WebSocket closed/);
    });

    it("respects maxBufferSize", async () => {
      const client = new WebSocketClient({ maxBufferSize: 2 });
      await client.connect(`${WS_URL}?mode=burst&count=5`);

      await new Promise((r) => setTimeout(r, 100));

      const m1 = await client.receive();
      const m2 = await client.receive();
      expect(m1.data).toBe("msg3");
      expect(m2.data).toBe("msg4");

      await client.close();
    });
  });

  describe("async iterator", () => {
    it("can break out of iteration without closing", async () => {
      const client = new WebSocketClient();
      await client.connect(`${WS_URL}?mode=echo`);

      await client.send("ping");

      for await (const msg of client) {
        expect(msg.data).toBe("ping");
        break;
      }

      expect(client.readyState).toBe("open");
      await client.close();
    });
  });

  describe("error handling", () => {
    it("rejects send when not open", async () => {
      const client = new WebSocketClient();
      await expect(client.send("hi")).rejects.toThrow(/Cannot send/);
    });

    it("rejects receive when idle", async () => {
      const client = new WebSocketClient();
      await expect(client.receive()).rejects.toThrow(/Cannot receive/);
    });

    it("rejects headers in browser", async () => {
      const client = new WebSocketClient();
      await expect(
        client.connect(`${WS_URL}?mode=echo`, {
          headers: { Authorization: "Bearer token" },
        }),
      ).rejects.toThrow(/headers.*not supported.*browser/i);
    });
  });

  describe("reconnect", () => {
    it("can connect again after close", async () => {
      const client = new WebSocketClient();

      await client.connect(`${WS_URL}?mode=echo`);
      await client.send("first");
      const m1 = await client.receive();
      expect(m1.data).toBe("first");
      await client.close();

      await client.connect(`${WS_URL}?mode=echo`);
      await client.send("second");
      const m2 = await client.receive();
      expect(m2.data).toBe("second");
      await client.close();
    });
  });
});
