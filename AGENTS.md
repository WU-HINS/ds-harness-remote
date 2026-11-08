# Repository guide

This repository contains only the self-hosted **server** for DeepSeek Harness
remote access, plus the wire protocol package it depends on.

## Layout

- `server/` — HTTP + WebSocket server (accounts, devices, admin UI, sessions).
- `packages/protocol/` — shared frame/RPC schemas (`@dsh-remote/protocol`).
- `docs/` — operator and API documentation.

## Rules

1. Schema is declarative: edit `server/src/schema.ts`, keep every statement idempotent.
2. Never log credentials, verification codes, or tokens.
3. Auth changes must ship with a test in `server/tests/`.
4. `pnpm build && pnpm -r check && pnpm test` must pass before committing.
- Single writer process: do not run two servers against one database.
