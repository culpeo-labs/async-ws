---
"@culpeo/async-ws": minor
---

### Standardize transport error messages

Errors surfaced from the underlying WebSocket transport (Node's `ws` and the browser `WebSocket`) now use a consistent, non-empty `"WebSocket transport error: <detail>"` message format instead of passing through the raw (sometimes empty, e.g. for `AggregateError`s from Node's Happy Eyeballs connection attempts) error message.
