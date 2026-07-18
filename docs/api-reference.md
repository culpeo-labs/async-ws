---
sidebar_position: 2
---

# API Reference

## `WebSocketClient`

### Constructor

```ts
new WebSocketClient(options?: ClientOptions)
```

Creates a new client instance.

#### Constructor options

- `maxBufferSize?: number`
  - Maximum number of incoming messages to keep buffered before they are consumed
  - Default: `0` (unlimited)
  - When the limit is reached, the oldest buffered message is dropped
- `keepAlive?: KeepAliveOptions`
  - Enables automatic ping/pong keep-alive (Node.js only)
  - Throws if used in a browser environment

### Properties

#### `client.readyState`

```ts
readonly readyState: WebSocketState
```

Returns the current client state: `"idle"`, `"connecting"`, `"open"`, `"closing"`, `"closed"`, or `"errored"`.

#### `client.protocol`

```ts
readonly protocol: string
```

Returns the negotiated subprotocol, or `""` when not connected.

#### `client.url`

```ts
readonly url: string
```

Returns the URL of the WebSocket connection, or `""` when not connected.

#### `client.bufferedAmount`

```ts
readonly bufferedAmount: number
```

Returns the number of bytes queued for transmission, or `0` when not connected.

#### `client.extensions`

```ts
readonly extensions: string
```

Returns the negotiated extensions, or `""` when not connected.

#### `client.lastCloseInfo`

```ts
readonly lastCloseInfo: WebSocketCloseInfo | null
```

Returns close metadata from the most recent close event, or `null` if the socket has not closed yet.

### Static methods

#### `fromSocket()`

```ts
static fromSocket(rawSocket: unknown, options?: ClientOptions): WebSocketClient
```

Wraps an already-open WebSocket into a `WebSocketClient` in the `"open"` state, ready to send and receive. Intended for server scenarios where a `WebSocketServer` hands you an established connection.

**Node.js only.** Throws in browser builds.

```ts
import { WebSocketServer } from "ws";
import { WebSocketClient } from "@culpeo/async-ws";

const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", async (socket) => {
  const client = WebSocketClient.fromSocket(socket);

  for await (const msg of client) {
    console.log("received:", msg.data);
    await client.send("echo: " + msg.data);
  }
});
```

The client takes ownership of the socket lifecycle — calling `close()` will close the underlying socket. Call `fromSocket()` immediately in the `connection` handler to avoid missing messages.

Accepts any WebSocket-compatible object (validated structurally, not via `instanceof`), so it works even when multiple copies of the `ws` package are installed.

### Instance methods

#### `connect()`

```ts
connect(url: string | URL, options?: ConnectOptions): Promise<void>
```

Opens a WebSocket connection and resolves when the connection is established.

Rejects when:

- the client is already connecting, open, or closing
- the socket constructor throws
- the connection errors before opening
- the socket closes before opening

##### `ConnectOptions`

- `protocols?: string | string[]` — WebSocket subprotocols to request
- `headers?: Record<string, string>` — custom handshake headers in Node.js
- `timeout?: number` — connection timeout in milliseconds; rejects if the connection is not established within this time
- `signal?: AbortSignal` — an abort signal to cancel the connection attempt

> In browsers, passing `headers` throws because the native WebSocket API does not support custom headers.

#### `send()`

```ts
send(data: string | ArrayBuffer | ArrayBufferView): Promise<void>
```

Sends text or binary data. Resolves when the underlying socket accepts the payload. Rejects if the client is not open or if the underlying adapter reports an error.

#### `receive()`

```ts
receive(): Promise<WebSocketMessage>
```

Resolves with the next incoming message.

Behavior:

- If buffered messages exist, returns the oldest buffered message immediately
- If no buffered message exists, waits for the next incoming message
- If the socket closes after buffering messages, buffered messages are still drained first
- Rejects when the client is not open and no buffered messages remain

#### `close()`

```ts
close(code?: number, reason?: string): Promise<void>
```

Starts the close handshake and resolves when the socket closes.

Behavior:

- Resolves immediately if the client is idle, already closed, or errored
- If a close is already in progress, waits for the close event
- Validates custom close codes before calling the underlying socket
- Accepts `1000` or values in the range `3000-4999`

### Async iterator

```ts
client[Symbol.asyncIterator](): AsyncGenerator<WebSocketMessage>
```

Allows consumption with `for await...of`.

Behavior:

- Yields incoming messages as they arrive
- Ends iteration on a clean close
- Throws on unexpected or error-driven termination
- Does not automatically close the socket if you `break` out of the loop

```ts
const client = new WebSocketClient();
await client.connect("wss://example.com/ws");

try {
  for await (const message of client) {
    if (!message.binary) {
      console.log("text:", message.data);
    }
  }
} finally {
  await client.close();
}
```

## Types

### `ConnectOptions`

```ts
interface ConnectOptions {
  protocols?: string | string[];
  headers?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
}
```

### `ClientOptions`

```ts
interface ClientOptions {
  maxBufferSize?: number;
  keepAlive?: KeepAliveOptions;
}
```

### `KeepAliveOptions`

```ts
interface KeepAliveOptions {
  interval: number;
  timeout?: number;
}
```

- `interval` — milliseconds between pings
- `timeout` — milliseconds to wait for a pong before terminating the connection (default: `interval`)

### `WebSocketMessage`

```ts
interface WebSocketMessage {
  data: string | ArrayBuffer;
  binary: boolean;
}
```

### `WebSocketCloseInfo`

```ts
interface WebSocketCloseInfo {
  code: number;
  reason: string;
  wasClean: boolean;
}
```

### `WebSocketState`

```ts
type WebSocketState =
  "idle" | "connecting" | "open" | "closing" | "closed" | "errored";
```

## Browser vs Node

`@culpeo/async-ws` ships one API for both environments:

- **Node.js build** uses the `ws` package internally
- **Browser build** uses the native `WebSocket` implementation

This is handled at build time with Rollup. The browser bundle aliases the Node adapter module to a browser-specific adapter, so application code does not need environment checks or separate imports.

## Error handling

All core operations are async and communicate failure by rejecting:

- `connect()` rejects on invalid state, connection failure, early close, timeout, or abort
- `send()` rejects when called before the socket is open or when the adapter fails to send
- `receive()` rejects when the client is not in a receivable state and no buffered messages remain
- `close()` rejects for invalid close codes

Additional notes:

- Connection errors are treated as terminal for pending receivers
- A socket error is typically followed by a close event; close metadata is exposed through `lastCloseInfo`
- If buffered messages exist when a close happens, those messages are still delivered before `receive()` starts rejecting
