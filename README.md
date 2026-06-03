# @culpeo/async-ws

> Promise-first WebSocket client for Node.js and browsers.
>
> [![npm version](https://img.shields.io/npm/v/%40culpeo/async-ws)](https://www.npmjs.com/package/@culpeo/async-ws)
> [![license](https://img.shields.io/npm/l/%40culpeo/async-ws)](./LICENSE)
> [![bundle size](https://img.shields.io/bundlephobia/minzip/%40culpeo/async-ws)](https://bundlephobia.com/package/@culpeo/async-ws)

`@culpeo/async-ws` is a cross-platform WebSocket client that turns the event-driven WebSocket API into a small, imperative, promise-based interface.

## Features

- Works in both Node.js and browsers from one package
- Promise-based `connect()`, `send()`, `receive()`, and `close()` APIs
- Async iteration support with `for await...of`
- Message buffering for messages that arrive before `receive()` is called
- Configurable `maxBufferSize` with oldest-message eviction when full
- Connect timeout and `AbortSignal` support
- Keep-alive with automatic ping/pong (Node.js)
- Exposed WebSocket properties (`protocol`, `url`, `bufferedAmount`, `extensions`)
- Clean close information via `lastCloseInfo`
- TypeScript-first with bundled type definitions
- Binary and text message support
- Browser build uses the native `WebSocket`; Node build uses `ws`

## Install

```bash
npm install @culpeo/async-ws
```

```bash
yarn add @culpeo/async-ws
```

```bash
pnpm add @culpeo/async-ws
```

## Quick Start

```ts
import { WebSocketClient } from "@culpeo/async-ws";

const client = new WebSocketClient();

await client.connect("wss://echo.websocket.events");
await client.send("hello");

const message = await client.receive();
console.log(message.data);   // string | ArrayBuffer
console.log(message.binary); // boolean

await client.close();
```

## API Reference

### `WebSocketClient`

#### Constructor

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

#### Properties

#### `client.readyState`

```ts
readonly readyState: WebSocketState
```

Returns the current client state:

- `"idle"`
- `"connecting"`
- `"open"`
- `"closing"`
- `"closed"`
- `"errored"`

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

#### Methods

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

Sends text or binary data.

Resolves when the underlying socket accepts the payload. Rejects if the client is not open or if the underlying adapter reports an error.

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

#### Async iterator

```ts
client[Symbol.asyncIterator](): AsyncGenerator<WebSocketMessage>
```

Allows consumption with `for await...of`.

Behavior:

- Yields incoming messages as they arrive
- Ends iteration on a clean close
- Throws on unexpected or error-driven termination
- Does not automatically close the socket if you `break` out of the loop

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

Connection-time options.

### `ClientOptions`

```ts
interface ClientOptions {
  maxBufferSize?: number;
  keepAlive?: KeepAliveOptions;
}
```

Client-level configuration.

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

Represents a received message payload.

### `WebSocketCloseInfo`

```ts
interface WebSocketCloseInfo {
  code: number;
  reason: string;
  wasClean: boolean;
}
```

Represents close metadata captured from the underlying socket.

### `WebSocketState`

```ts
type WebSocketState =
  | "idle"
  | "connecting"
  | "open"
  | "closing"
  | "closed"
  | "errored";
```

Represents the client lifecycle state.

## Browser vs Node

`@culpeo/async-ws` ships one API for both environments:

- **Node.js build** uses the `ws` package internally
- **Browser build** uses the native `WebSocket` implementation

This is handled at build time with Rollup. The browser bundle aliases the Node adapter module to a browser-specific adapter, so application code does not need environment checks or separate imports.

In practice, that means you write this once:

```ts
import { WebSocketClient } from "@culpeo/async-ws";
```

…and the appropriate adapter is selected by the published package exports and browser build.

## Async Iterator

```ts
import { WebSocketClient } from "@culpeo/async-ws";

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

This is useful when you want a stream-like consumer loop without manually calling `receive()` each time.

## Error Handling

All core operations are async and communicate failure by rejecting:

- `connect()` rejects on invalid state, connection failure, early close, timeout, or abort
- `send()` rejects when called before the socket is open or when the adapter fails to send
- `receive()` rejects when the client is not in a receivable state and no buffered messages remain
- `close()` rejects for invalid close codes

Additional notes:

- Connection errors are treated as terminal for pending receivers
- A socket error is typically followed by a close event; close metadata is exposed through `lastCloseInfo`
- If buffered messages exist when a close happens, those messages are still delivered before `receive()` starts rejecting

A simple pattern:

```ts
try {
  await client.connect("wss://example.com/ws");
  await client.send("ping");
  const reply = await client.receive();
  console.log(reply);
} catch (error) {
  console.error("WebSocket operation failed", error);
  console.error("Last close info:", client.lastCloseInfo);
}
```

## Message Buffering

Incoming messages are buffered when they arrive before a consumer calls `receive()`.

By default, buffering is unlimited:

```ts
const client = new WebSocketClient();
```

To cap memory usage, set `maxBufferSize`:

```ts
const client = new WebSocketClient({ maxBufferSize: 100 });
```

When the buffer is full:

- the oldest message is removed
- the newest message is stored

This makes buffering predictable for bursty message streams while keeping the public API simple.

## Connection Timeout and Abort

Use `timeout` to reject if the connection isn't established within a deadline:

```ts
await client.connect("wss://example.com/ws", { timeout: 5000 });
```

Use `signal` to cancel a connection attempt at any time:

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(), 3000);

await client.connect("wss://example.com/ws", { signal: controller.signal });
```

Both can be combined:

```ts
await client.connect("wss://example.com/ws", {
  timeout: 10000,
  signal: controller.signal,
});
```

## Keep-Alive (Node.js)

Enable automatic ping/pong to detect dead connections:

```ts
const client = new WebSocketClient({
  keepAlive: { interval: 30000, timeout: 5000 },
});

await client.connect("wss://example.com/ws");
```

- Sends a ping every `interval` milliseconds
- If no pong is received within `timeout` milliseconds, the connection is terminated
- `timeout` defaults to `interval` if omitted
- **Not available in browsers** — the constructor throws if `keepAlive` is configured in a browser environment

## Building from Source

```bash
git clone <your-fork-or-repo-url>
cd <repo-directory>
npm install
```

Run tests:

```bash
npm test
npm run test:browser
```

Build the package:

```bash
npm run build
```

Current build outputs include:

- CommonJS for Node.js
- ESM for Node.js
- Browser ESM
- Browser IIFE bundle
- Bundled TypeScript declarations

## License

MIT
