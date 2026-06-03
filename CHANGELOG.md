# Changelog

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
