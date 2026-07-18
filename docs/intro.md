---
sidebar_position: 1
sidebar_label: Overview
---

# async-ws

`@culpeo/async-ws` is a cross-platform WebSocket client that turns the event-driven WebSocket API into a small, imperative, promise-based interface.

## Key features

- Works in both Node.js and browsers from one package
- Promise-based `connect()`, `send()`, `receive()`, and `close()` APIs
- Async iteration support with `for await...of`
- Message buffering for messages that arrive before `receive()` is called
- Configurable `maxBufferSize` with oldest-message eviction when full
- Connect timeout and `AbortSignal` support
- Keep-alive with automatic ping/pong (Node.js)
- Server-side socket adoption with `fromSocket()` (Node.js)
- TypeScript-first with bundled type definitions

## Repository

[culpeo-labs/async-ws](https://github.com/culpeo-labs/async-ws) — [npm](https://www.npmjs.com/package/@culpeo/async-ws)

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

## Quick start

```ts
import { WebSocketClient } from "@culpeo/async-ws";

const client = new WebSocketClient();

await client.connect("wss://echo.websocket.events");
await client.send("hello");

const message = await client.receive();
console.log(message.data); // string | ArrayBuffer
console.log(message.binary); // boolean

await client.close();
```

See [API Reference](./api-reference) for full details.
