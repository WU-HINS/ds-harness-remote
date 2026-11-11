# Documentation

- [Development rules](../root.ai.md) — the engineering contract (generated mirror of the project-root
  `root.ai.md`): positioning, layering, gates, capability invariants, review board, commit format.
- [Configuration](configuration.md) — environment variables and runtime settings.
- [Authentication](auth.md) — accounts, OIDC, device credentials.
- [API](api.md) — HTTP and WebSocket surface.
- [Operations](operations.md) — deployment, proxy, backup, upgrades.
- [Security](security.md) — what the server can and cannot see.

`docs/api.md` is the only authoritative description of the HTTP surface: `scripts/guard` compares it against
`server/src/app.ts` and `server/src/routes/*.ts` on every run, so a route that exists but is undocumented fails the gate.
