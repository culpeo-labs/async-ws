---
"@culpeo/async-ws": major
---

### Connect timeout and abort signal

`connect()` now accepts `timeout` (milliseconds) and `signal` (AbortSignal) options to cancel connection attempts.

### Keep-alive ping/pong (Node.js)

New `keepAlive` constructor option sends periodic pings and terminates the connection if no pong is received. Not available in browsers.

### Exposed WebSocket properties

Added read-only `protocol`, `url`, `bufferedAmount`, and `extensions` properties that delegate to the underlying socket.
