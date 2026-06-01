# ws-lib

Cross-platform imperative WebSocket client for browser and Node.js.

Turns the event-driven WebSocket API into a promise-based one, with a single
codebase that Rollup compiles to separate browser and Node bundles.

## Install

```bash
npm install ws-lib
```

## Usage

```ts
import { WebSocketClient } from "ws-lib";

const client = new WebSocketClient();

// Connect
await client.connect("wss://example.com/ws");

// Send
await client.send("hello");
await client.send(new Uint8Array([1, 2, 3]));

// Receive (imperative)
const msg = await client.receive();
console.log(msg.data);   // string | ArrayBuffer
console.log(msg.binary); // boolean

// Receive (async iterator)
for await (const msg of client) {
  console.log(msg.data);
}

// Close
await client.close();
```

## API

### `new WebSocketClient()`

Creates a new client in `"idle"` state.

### `client.connect(url, options?): Promise<void>`

Opens a WebSocket connection. Resolves when the socket is open.

**Options:**
- `protocols` — subprotocol(s) to request
- `headers` — custom HTTP headers (Node.js only; throws in browser)

### `client.send(data): Promise<void>`

Sends a string, ArrayBuffer, or ArrayBufferView. Resolves when accepted.

### `client.receive(): Promise<WebSocketMessage>`

Returns the next message. Buffers messages that arrive before `receive()` is
called. After the socket closes, drains remaining buffered messages before
rejecting.

### `client.close(code?, reason?): Promise<void>`

Closes the connection. Resolves when the close handshake completes.

### `client[Symbol.asyncIterator]()`

Yields messages via `for await...of`. Ends on clean close; throws on error.

### `client.readyState`

One of: `"idle"`, `"connecting"`, `"open"`, `"closing"`, `"closed"`, `"errored"`.

### `client.lastCloseInfo`

After close: `{ code, reason, wasClean }`. Otherwise `null`.

## Build Targets

| Export condition | Format | File                     | WebSocket source |
| ---------------- | ------ | ------------------------ | ---------------- |
| `require`        | CJS    | `dist/cjs/index.cjs`    | `ws` package     |
| `import`         | ESM    | `dist/esm/index.js`     | `ws` package     |
| `browser.import` | ESM    | `dist/browser/index.js` | native WebSocket |
| `browser`        | IIFE   | `dist/iife/index.js`    | native WebSocket |

Rollup uses `@rollup/plugin-alias` to swap the Node WebSocket implementation
for the browser one at build time.

## License

MIT
