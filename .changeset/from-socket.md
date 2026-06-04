---
"@culpeo/async-ws": minor
---

### Adopt existing WebSocket connections

New static method `WebSocketClient.fromSocket(socket, options?)` wraps an already-open WebSocket (e.g. from a `WebSocketServer` connection event) into a ready-to-use `WebSocketClient`. Node.js only.
