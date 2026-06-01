import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { WebSocketServer, WebSocket as WS } from "ws";
import { WebSocketClient } from "../src/index";

let wss: WebSocketServer;
let port: number;

function startServer(
  onConnection?: (ws: WS) => void,
): Promise<void> {
  return new Promise((resolve) => {
    wss = new WebSocketServer({ port: 0 });
    wss.on("listening", () => {
      port = (wss.address() as { port: number }).port;
      resolve();
    });
    if (onConnection) {
      wss.on("connection", onConnection);
    }
  });
}

function stopServer(): Promise<void> {
  return new Promise((resolve) => {
    if (wss) {
      wss.close(() => resolve());
    } else {
      resolve();
    }
  });
}

describe("WebSocketClient", () => {
  let client: WebSocketClient;

  beforeEach(() => {
    client = new WebSocketClient();
  });

  afterEach(async () => {
    try {
      await client.close();
    } catch {}
    await stopServer();
  });

  describe("connect / send / receive basics", () => {
    it("connects, sends, and receives a message", async () => {
      await startServer((ws) => {
        ws.on("message", (data) => ws.send("echo:" + data.toString()));
      });

      await client.connect(`ws://localhost:${port}`);
      expect(client.readyState).toBe("open");

      await client.send("hello");
      const msg = await client.receive();
      expect(msg.data).toBe("echo:hello");
      expect(msg.binary).toBe(false);
    });

    it("receives binary data", async () => {
      await startServer((ws) => {
        ws.on("message", () => {
          ws.send(Buffer.from([1, 2, 3]));
        });
      });

      await client.connect(`ws://localhost:${port}`);
      await client.send("ping");
      const msg = await client.receive();
      expect(msg.binary).toBe(true);
      expect(msg.data).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(msg.data as ArrayBuffer)).toEqual(
        new Uint8Array([1, 2, 3]),
      );
    });
  });

  describe("close", () => {
    it("resolves and sets closeInfo on clean close", async () => {
      await startServer();
      await client.connect(`ws://localhost:${port}`);
      await client.close();

      expect(client.readyState).toBe("closed");
      expect(client.lastCloseInfo).not.toBeNull();
      expect(client.lastCloseInfo!.wasClean).toBe(true);
    });

    it("resolves immediately when already closed", async () => {
      await startServer();
      await client.connect(`ws://localhost:${port}`);
      await client.close();
      await client.close();
      expect(client.readyState).toBe("closed");
    });

    it("resolves immediately when idle", async () => {
      await client.close();
      expect(client.readyState).toBe("idle");
    });

    it("rejects with invalid close code instead of hanging", async () => {
      await startServer();
      await client.connect(`ws://localhost:${port}`);

      // Code 999 is invalid (must be 1000 or 3000-4999)
      await expect(client.close(999)).rejects.toThrow();
    });
  });

  describe("error handling", () => {
    it("transitions to closed (not errored) after server close", async () => {
      await startServer((ws) => {
        ws.close(1002, "protocol-error");
      });

      await client.connect(`ws://localhost:${port}`);
      await expect(client.receive()).rejects.toThrow();

      expect(client.readyState).toBe("closed");
      expect(client.lastCloseInfo).not.toBeNull();
      expect(client.lastCloseInfo!.code).toBe(1002);
    });

    it("populates closeInfo after an error-then-close sequence", async () => {
      await startServer((ws) => {
        ws.close(1011, "server-error");
      });

      await client.connect(`ws://localhost:${port}`);
      try {
        await client.receive();
      } catch {}

      expect(client.lastCloseInfo).not.toBeNull();
      expect(client.lastCloseInfo!.code).toBe(1011);
      expect(client.lastCloseInfo!.reason).toBe("server-error");
    });

    it("close() resolves after connection error", async () => {
      await startServer((ws) => {
        ws.close(1002, "bad");
      });

      await client.connect(`ws://localhost:${port}`);
      try {
        await client.receive();
      } catch {}

      // close() must not hang
      await client.close();
      expect(client.readyState).toBe("closed");
    });

    it("close() resolves immediately on errored state", async () => {
      // Connect to an unreachable port to trigger an error
      try {
        await client.connect("ws://localhost:1");
      } catch {}

      // close() must resolve, not hang
      await client.close();
    });

    it("rejects connect on unreachable port", async () => {
      await expect(
        client.connect("ws://localhost:1"),
      ).rejects.toThrow();
    });

    it("rejects send when not open", async () => {
      await expect(client.send("hi")).rejects.toThrow(/Cannot send/);
    });

    it("rejects receive when idle", async () => {
      await expect(client.receive()).rejects.toThrow(/Cannot receive/);
    });
  });

  describe("message buffering", () => {
    it("buffers messages arriving before receive()", async () => {
      await startServer((ws) => {
        ws.send("msg1");
        ws.send("msg2");
        ws.send("msg3");
      });

      await client.connect(`ws://localhost:${port}`);
      await new Promise((r) => setTimeout(r, 50));

      const m1 = await client.receive();
      const m2 = await client.receive();
      const m3 = await client.receive();
      expect(m1.data).toBe("msg1");
      expect(m2.data).toBe("msg2");
      expect(m3.data).toBe("msg3");
    });

    it("drains buffered messages after close before rejecting", async () => {
      await startServer((ws) => {
        ws.send("last-msg");
        ws.close(1000, "done");
      });

      await client.connect(`ws://localhost:${port}`);
      await new Promise((r) => setTimeout(r, 50));

      const msg = await client.receive();
      expect(msg.data).toBe("last-msg");

      await expect(client.receive()).rejects.toThrow();
    });

    it("drops oldest messages when maxBufferSize is exceeded", async () => {
      const bounded = new WebSocketClient({ maxBufferSize: 2 });

      await startServer((ws) => {
        ws.send("a");
        ws.send("b");
        ws.send("c"); // should drop "a"
      });

      await bounded.connect(`ws://localhost:${port}`);
      await new Promise((r) => setTimeout(r, 50));

      const m1 = await bounded.receive();
      const m2 = await bounded.receive();
      expect(m1.data).toBe("b");
      expect(m2.data).toBe("c");

      await bounded.close();
    });

    it("does not limit buffer when maxBufferSize is 0 (default)", async () => {
      await startServer((ws) => {
        for (let i = 0; i < 100; i++) {
          ws.send(`msg${i}`);
        }
      });

      await client.connect(`ws://localhost:${port}`);
      await new Promise((r) => setTimeout(r, 100));

      for (let i = 0; i < 100; i++) {
        const msg = await client.receive();
        expect(msg.data).toBe(`msg${i}`);
      }
    });
  });

  describe("async iterator", () => {
    it("yields messages and ends on clean close", async () => {
      await startServer((ws) => {
        ws.send("a");
        ws.send("b");
        setTimeout(() => ws.close(1000, "done"), 50);
      });

      await client.connect(`ws://localhost:${port}`);

      const messages: string[] = [];
      for await (const msg of client) {
        messages.push(msg.data as string);
      }

      expect(messages).toEqual(["a", "b"]);
    });

    it("can break out of iteration without closing", async () => {
      await startServer((ws) => {
        ws.on("message", () => ws.send("pong"));
      });

      await client.connect(`ws://localhost:${port}`);
      await client.send("ping");

      for await (const msg of client) {
        expect(msg.data).toBe("pong");
        break;
      }

      expect(client.readyState).toBe("open");
      await client.close();
    });
  });

  describe("reconnect after close", () => {
    it("can connect again after a clean close", async () => {
      await startServer((ws) => {
        ws.on("message", (d) => ws.send("echo:" + d.toString()));
      });

      await client.connect(`ws://localhost:${port}`);
      await client.send("first");
      const m1 = await client.receive();
      expect(m1.data).toBe("echo:first");
      await client.close();

      await client.connect(`ws://localhost:${port}`);
      await client.send("second");
      const m2 = await client.receive();
      expect(m2.data).toBe("echo:second");
      await client.close();
    });
  });
});
