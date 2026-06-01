# Changelog

## 0.1.0

Initial release.

- Cross-platform WebSocket client for Node.js and browsers
- Promise-based `connect()`, `send()`, `receive()`, `close()` API
- Async iteration with `for await...of`
- Message buffering with configurable `maxBufferSize`
- Close info tracking via `lastCloseInfo`
- TypeScript-first with bundled type definitions
- Node.js build uses `ws`; browser build uses native WebSocket
