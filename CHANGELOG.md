# Changelog

## 1.2.0

### Minor Changes

- 862b158: ### Update supported Node.js versions

  Dropped Node.js 20 (EOL) from the supported engines range (now `>=22`) and added Node.js 24 and 26 to CI coverage.

- 862b158: ### Standardize transport error messages

  Errors surfaced from the underlying WebSocket transport (Node's `ws` and the browser `WebSocket`) now use a consistent, non-empty `"WebSocket transport error: <detail>"` message format instead of passing through the raw (sometimes empty, e.g. for `AggregateError`s from Node's Happy Eyeballs connection attempts) error message.

### Patch Changes

- 862b158: ### Migrate formatting and linting to oxc tooling

  Replaced Prettier with `oxfmt` and added `oxlint` for linting, configured via `oxfmt.config.ts` and `oxlint.config.ts`. This is an internal tooling change only; there is no functional or API impact.

- 862b158: ### Migrate build tooling to rolldown

  Replaced Rollup with rolldown for building the package bundles. This is an internal build-tooling change with no functional or API differences; it may affect the produced bundle output.

## 1.1.0

### Minor Changes

- 89a662e: ### Adopt existing WebSocket connections

  New static method `WebSocketClient.fromSocket(socket, options?)` wraps an already-open WebSocket (e.g. from a `WebSocketServer` connection event) into a ready-to-use `WebSocketClient`. Node.js only.

## 1.0.0

### Major Changes

- 6b68e4c: ### Connect timeout and abort signal

  `connect()` now accepts `timeout` (milliseconds) and `signal` (AbortSignal) options to cancel connection attempts.

  ### Keep-alive ping/pong (Node.js)

  New `keepAlive` constructor option sends periodic pings and terminates the connection if no pong is received. Not available in browsers.

  ### Exposed WebSocket properties

  Added read-only `protocol`, `url`, `bufferedAmount`, and `extensions` properties that delegate to the underlying socket.

## 0.2.0

### Minor Changes

- 9453a7c: Initial release
  - Cross-platform WebSocket client for Node.js and browsers
  - Promise-based `connect()`, `send()`, `receive()`, `close()` API
  - Async iteration with `for await...of`
  - Message buffering with configurable `maxBufferSize`
  - Clean close info tracking via `lastCloseInfo`
  - TypeScript-first with bundled type definitions

## 0.1.0

Initial release.

- Cross-platform WebSocket client for Node.js and browsers
- Promise-based `connect()`, `send()`, `receive()`, `close()` API
- Async iteration with `for await...of`
- Message buffering with configurable `maxBufferSize`
- Close info tracking via `lastCloseInfo`
- TypeScript-first with bundled type definitions
- Node.js build uses `ws`; browser build uses native WebSocket
