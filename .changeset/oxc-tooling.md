---
"@culpeo/async-ws": patch
---

### Migrate formatting and linting to oxc tooling

Replaced Prettier with `oxfmt` and added `oxlint` for linting, configured via `oxfmt.config.ts` and `oxlint.config.ts`. This is an internal tooling change only; there is no functional or API impact.
