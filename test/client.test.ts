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

  describe("state guards", () => {
    it("rejects connect when already connecting", async () => {
      await startServer();
      const p = client.connect(`ws://localhost:${port}`);
      await expect(
        client.connect(`ws://localhost:${port}`),
      ).rejects.toThrow(/Cannot connect/);
      await p;
    });

    it("rejects connect when already open", async () => {
      await startServer();
      await client.connect(`ws://localhost:${port}`);
      await expect(
        client.connect(`ws://localhost:${port}`),
      ).rejects.toThrow(/Cannot connect/);
    });

    it("rejects send during connecting", async () => {
      await startServer();
      const p = client.connect(`ws://localhost:${port}`);
      await expect(client.send("hi")).rejects.toThrow(/Cannot send/);
      await p;
    });

    it("rejects receive during connecting", async () => {
      await startServer();
      const p = client.connect(`ws://localhost:${port}`);
      await expect(client.receive()).rejects.toThrow(/Cannot receive/);
      await p;
    });
  });

  describe("concurrent receive", () => {
    it("multiple receive() calls resolve in order", async () => {
      await startServer((ws) => {
        setTimeout(() => {
          ws.send("first");
          ws.send("second");
          ws.send("third");
        }, 30);
      });

      await client.connect(`ws://localhost:${port}`);

      // Queue up multiple receive() calls before messages arrive
      const [m1, m2, m3] = await Promise.all([
        client.receive(),
        client.receive(),
        client.receive(),
      ]);

      expect(m1.data).toBe("first");
      expect(m2.data).toBe("second");
      expect(m3.data).toBe("third");
    });

    it("pending receives all reject on close", async () => {
      await startServer((ws) => {
        setTimeout(() => ws.close(1000, "bye"), 30);
      });

      await client.connect(`ws://localhost:${port}`);

      const results = await Promise.allSettled([
        client.receive(),
        client.receive(),
        client.receive(),
      ]);

      for (const result of results) {
        expect(result.status).toBe("rejected");
      }
    });
  });

  describe("send data types", () => {
    it("sends ArrayBuffer", async () => {
      await startServer((ws) => {
        ws.on("message", (data, isBinary) => {
          ws.send(isBinary ? "binary" : "text");
        });
      });

      await client.connect(`ws://localhost:${port}`);
      await client.send(new Uint8Array([1, 2, 3]).buffer);
      const msg = await client.receive();
      expect(msg.data).toBe("binary");
    });

    it("sends ArrayBufferView", async () => {
      await startServer((ws) => {
        ws.on("message", (data, isBinary) => {
          ws.send(isBinary ? "binary" : "text");
        });
      });

      await client.connect(`ws://localhost:${port}`);
      await client.send(new Uint8Array([4, 5, 6]));
      const msg = await client.receive();
      expect(msg.data).toBe("binary");
    });

    it("sends empty string", async () => {
      await startServer((ws) => {
        ws.on("message", (data) => ws.send("got:" + data.toString()));
      });

      await client.connect(`ws://localhost:${port}`);
      await client.send("");
      const msg = await client.receive();
      expect(msg.data).toBe("got:");
    });
  });

  describe("close with valid custom codes", () => {
    it("accepts close code 1000", async () => {
      await startServer();
      await client.connect(`ws://localhost:${port}`);
      await client.close(1000, "normal");
      expect(client.readyState).toBe("closed");
    });

    it("accepts close code 3000", async () => {
      await startServer();
      await client.connect(`ws://localhost:${port}`);
      await client.close(3000, "custom");
      expect(client.readyState).toBe("closed");
    });

    it("accepts close code 4999", async () => {
      await startServer();
      await client.connect(`ws://localhost:${port}`);
      await client.close(4999);
      expect(client.readyState).toBe("closed");
    });

    it("rejects close code 1001", async () => {
      await startServer();
      await client.connect(`ws://localhost:${port}`);
      await expect(client.close(1001)).rejects.toThrow(/Invalid close code/);
    });

    it("rejects close code 2999", async () => {
      await startServer();
      await client.connect(`ws://localhost:${port}`);
      await expect(client.close(2999)).rejects.toThrow(/Invalid close code/);
    });

    it("rejects close code 5000", async () => {
      await startServer();
      await client.connect(`ws://localhost:${port}`);
      await expect(client.close(5000)).rejects.toThrow(/Invalid close code/);
    });
  });

  describe("connect timeout", () => {
    it("rejects when connection takes too long", async () => {
      // Connect to a non-routable IP to simulate timeout
      const client2 = new WebSocketClient();
      await expect(
        client2.connect("ws://10.255.255.1:9999", { timeout: 100 }),
      ).rejects.toThrow(/timed out/);
    });

    it("succeeds when connection is faster than timeout", async () => {
      await startServer();
      await client.connect(`ws://localhost:${port}`, { timeout: 5000 });
      expect(client.readyState).toBe("open");
    });

    it("rejects invalid timeout", async () => {
      await expect(
        client.connect("ws://localhost:1", { timeout: 0 }),
      ).rejects.toThrow(/timeout must be greater than 0/);
      await expect(
        client.connect("ws://localhost:1", { timeout: -100 }),
      ).rejects.toThrow(/timeout must be greater than 0/);
    });
  });

  describe("abort signal", () => {
    it("rejects with already-aborted signal", async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        client.connect("ws://localhost:1", { signal: controller.signal }),
      ).rejects.toThrow(/aborted/);
    });

    it("rejects when signal is aborted during connection", async () => {
      const controller = new AbortController();
      const client2 = new WebSocketClient();
      // Connect to a non-routable IP so it doesn't resolve quickly
      const p = client2.connect("ws://10.255.255.1:9999", {
        signal: controller.signal,
      });
      setTimeout(() => controller.abort(), 50);
      await expect(p).rejects.toThrow(/aborted/);
    });

    it("does not abort when signal is not triggered", async () => {
      await startServer();
      const controller = new AbortController();
      await client.connect(`ws://localhost:${port}`, {
        signal: controller.signal,
      });
      expect(client.readyState).toBe("open");
    });
  });

  describe("exposed properties", () => {
    it("returns empty values when not connected", () => {
      expect(client.protocol).toBe("");
      expect(client.url).toBe("");
      expect(client.bufferedAmount).toBe(0);
      expect(client.extensions).toBe("");
    });

    it("returns url and protocol when connected", async () => {
      await startServer();
      await client.connect(`ws://localhost:${port}`);
      expect(client.url).toContain(`ws://localhost:${port}`);
      expect(typeof client.protocol).toBe("string");
      expect(typeof client.bufferedAmount).toBe("number");
      expect(typeof client.extensions).toBe("string");
    });

    it("returns negotiated subprotocol", async () => {
      wss = new WebSocketServer({
        port: 0,
        handleProtocols: (protocols) => {
          if (protocols.has("chat")) return "chat";
          return false;
        },
      });
      await new Promise<void>((resolve) => {
        wss.on("listening", () => {
          port = (wss.address() as { port: number }).port;
          resolve();
        });
      });

      await client.connect(`ws://localhost:${port}`, {
        protocols: ["chat", "json"],
      });
      expect(client.protocol).toBe("chat");
    });
  });

  describe("keepAlive", () => {
    it("throws on invalid keepAlive interval", () => {
      expect(
        () => new WebSocketClient({ keepAlive: { interval: 0 } }),
      ).toThrow(/interval must be greater than 0/);
      expect(
        () => new WebSocketClient({ keepAlive: { interval: -100 } }),
      ).toThrow(/interval must be greater than 0/);
    });

    it("keeps connection alive with ping/pong", async () => {
      await startServer();
      const keepAliveClient = new WebSocketClient({
        keepAlive: { interval: 50, timeout: 200 },
      });

      await keepAliveClient.connect(`ws://localhost:${port}`);
      expect(keepAliveClient.readyState).toBe("open");

      // Wait long enough for multiple pings to have been sent
      await new Promise((r) => setTimeout(r, 180));
      expect(keepAliveClient.readyState).toBe("open");

      await keepAliveClient.close();
    });

    it("terminates on pong timeout", async () => {
      // Create a server that doesn't respond to pings
      await startServer((ws) => {
        // Suppress automatic pong by replacing the socket's pong method
        (ws as any).pong = () => {};
      });

      const keepAliveClient = new WebSocketClient({
        keepAlive: { interval: 30, timeout: 30 },
      });

      await keepAliveClient.connect(`ws://localhost:${port}`);

      // Wait for the keepalive timeout to fire
      await new Promise((r) => setTimeout(r, 200));
      expect(keepAliveClient.readyState).toBe("closed");
    });

    it("cleans up timers on close", async () => {
      await startServer();
      const keepAliveClient = new WebSocketClient({
        keepAlive: { interval: 50 },
      });

      await keepAliveClient.connect(`ws://localhost:${port}`);
      await keepAliveClient.close();
      expect(keepAliveClient.readyState).toBe("closed");

      // No lingering timers should cause issues
      await new Promise((r) => setTimeout(r, 100));
    });
  });
});
