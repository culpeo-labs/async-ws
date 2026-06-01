/**
 * Global setup for browser tests.
 * Starts a WebSocket server that the browser tests connect to.
 */
import { WebSocketServer } from "ws";

const PORT = 18973;

let wss: WebSocketServer;

export async function setup() {
  try {
    wss = new WebSocketServer({ port: PORT, host: "127.0.0.1" });
    await new Promise<void>((resolve, reject) => {
      wss.on("listening", () => resolve());
      wss.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          // Server already running from a previous setup call
          resolve();
        } else {
          reject(err);
        }
      });
    });
  } catch {
    // Server already running, skip
    return;
  }

  wss.on("connection", (ws, req) => {
    const url = new URL(req.url!, `http://localhost:${PORT}`);
    const mode = url.searchParams.get("mode");

    switch (mode) {
      case "echo":
        ws.on("message", (data, isBinary) => {
          if (isBinary) {
            ws.send(data);
          } else {
            ws.send(data.toString());
          }
        });
        break;
      case "send-then-close":
        ws.send("last-msg");
        ws.close(1000, "done");
        break;
      case "burst": {
        const count = parseInt(url.searchParams.get("count") ?? "3", 10);
        for (let i = 0; i < count; i++) {
          ws.send(`msg${i}`);
        }
        break;
      }
      case "binary":
        ws.on("message", () => ws.send(Buffer.from([1, 2, 3])));
        break;
      case "close-immediately":
        ws.close(1000, "bye");
        break;
      case "close-after-messages":
        ws.on("message", (data) => ws.send(data));
        setTimeout(() => ws.close(1000, "done"), 100);
        break;
      default:
        ws.on("message", (data) => ws.send("echo:" + data.toString()));
        break;
    }
  });

  console.log(`[ws-test-server] listening on port ${PORT}`);
}

export async function teardown() {
  if (wss) {
    await new Promise<void>((resolve) => wss.close(() => resolve()));
  }
}
