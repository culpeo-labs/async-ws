import * as net from "node:net";

/**
 * A TCP server that accepts connections but never sends a WebSocket
 * upgrade response — useful for deterministically testing connection
 * timeouts and aborts.
 */
export class HangingServer {
  private server: net.Server | null = null;
  private connections: net.Socket[] = [];

  /** Start listening on a random port. Resolves with the port number. */
  start(): Promise<number> {
    return new Promise((resolve) => {
      this.server = net.createServer((socket) => {
        this.connections.push(socket);
        socket.on("close", () => {
          this.connections = this.connections.filter((s) => s !== socket);
        });
      });
      this.server.listen(0, () => {
        resolve((this.server!.address() as net.AddressInfo).port);
      });
    });
  }

  /** Destroy all connections and close the server. */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      for (const socket of this.connections) {
        socket.destroy();
      }
      this.connections = [];
      if (this.server) {
        this.server.close(() => resolve());
        this.server = null;
      } else {
        resolve();
      }
    });
  }
}
