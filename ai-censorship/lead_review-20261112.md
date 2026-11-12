# 目标轮 1 · M1/M2：预算回收与网关级中继回归

- 基线：`ee0f64f`；目标 `goal-a2e39b84…`（v1.17.0）
- 范围：D13（零余量拆分）、D12（网关级中继排队回归）

## M1 · D13：拆 gateway，恢复可维护性

| 文件 | 变化 |
|---|---|
| `server/src/gateway-support.ts`（新，91 行） | `ConnectionState`/`Peer`/`Link`、`GatewayOptions`、`MAX_ICE…`/`SUPPORTED_TRANSPORTS`、`modernHost` 与诊断清洗函数 |
| `server/src/gateway.ts` | 621→**556** 行；保留 `export { MAX_ICE… }` / `export type { GatewayOptions }`，导入面不变 |
| `scripts/guard/rules/file-budget.mjs` | 行数等于预算时输出「已到预算上限」，不再是静默状态 |
| 预算/契约 | gateway 预算 621→556；D13 关闭；D3 仍开放（连接状态机） |

## M2 · D12：网关级中继顺序回归

- `gateway.ts` 把认证帧处理收束为 `processAuthenticatedFrame`：有队列即入队，否则 `handle`；WebSocket 监听器只调用该方法。
- 新增 `server/tests/gateway-admission-integration.mjs`（4 条）：
  - 耗尽账号额度后第一帧入队；
  - 等待补额后第二帧仍入队（旧 take-then-enqueue 会越队）；
  - 队列内 counter 顺序为 `[0,1]`；
  - 静态断言 WebSocket 监听器确实调用 `processAuthenticatedFrame`。
- 判别测试：把 `shouldQueue` 改回 take-then-enqueue，用例 1 通过 / 2 失败；删除监听器调用，静态断言失败。

## 证据

```
pnpm verify（57 s）  build ✓ check ✓ guard 12/12 ✓ test ✓
  protocol 94；server 304；合计 398 条断言，0 failed
pnpm test:pg（PostgreSQL 15.19）  pg-smoke 9 passed，其余全绿
Chromium（真库）                 70/70
真 SMTP + OIDC 走查              60/60
```

## 审核

`reviewer-diff2`：**APPROVE**（0 P0/P1）。三项 P2 已处理：

1. D12 只测私有方法、删调用点仍绿 → 增加 WebSocket 监听器调用点的静态断言；
2. D13 四文件仍 0 余量、equality 无提示 → `file-budget` 增加「已到预算上限」输出，gateway 556/556；
3. "in order" 只数帧数 → 改为断言队列内 counter `[0,1]`。

## 剩余

- M3：D14（M4 每用户两层限流 + S1–S11 覆盖门禁）
- M4：审计可用性（AUDIT_UNAVAILABLE / readiness + OIDC 审计失败回归）
- M5：发布 1.17.0（D15）

---

# 目标轮 2 · M3/M4/M5：D14、审计可用性、发布 1.17.0

## M3 · D14 关闭

- `invariant-coverage` 扩展为 **30 条**：S1–S11 + O1–O7 + M1–M5 + K1–K7；策略、规则标题、§3.2/§6 同步。
- 新增/具名覆盖：
  - S1 静态断言 Gateway 不写库/不审计中继 payload；S2 口令 scrypt + 会话摘要；
  - S3/S4/S5/S6/S7/S8/S9/S10 复用并标注既有用例；S11 日志脱敏（key + 值 + 深度）。
- M4 每用户请求限流：独立用户实测 `[200,200,200,429]`，不影响其他租户。
- M4 并发连接上限：新增 `gateway-connection-limit.mjs`，真实 WS：首个 hello.ack，第二个同用户连接 `RATE_LIMITED`。

## M4 · 审计可用性

- `store.audit()` 失败改为 `AUDIT_UNAVAILABLE`（503），不再抛裸 DB 错误；错误码 53→54，`docs/api.md` 写明 fail-closed。
- OIDC 成功审计已 `await`（上一轮修复），新增静态断言 `[M5] OIDC success audit is awaited`，防止回退成 `void`。
- `invariants-smoke` 断言失败 pool 返回 503 且进程存活。

## M5 · 发布 1.17.0

- 三处 `package.json` = 1.17.0；协议 0.5.21；`root.ai.md` 头行与 §2 同步。
- D15 关闭：1.17.0 > 1.16.2，`latest` 向前移动。
- 最终门禁：verify **405** 断言（server 311 + protocol 94）、test:pg 9、browser 70/70、journey 60/60、guard 12/12。
- tag `v1.17.0` 与镜像 `1.17.0 / 1.17 / latest` 在推送后核对。

## 发布结果（v1.17.0）

- CI run 43072565412：Check and test ✓ / Build image (no push) ✓ / Store smoke on PostgreSQL ✓
- Release run 43072565756：Validate tag ✓ / Create GitHub release ✓ / Publish image ✓
- Release：https://github.com/WU-HINS/ds-harness-remote/releases/tag/v1.17.0
- 镜像：`ghcr.io/wu-hins/ds-harness-remote/server` → `1.17.0`、`1.17`、`latest`
- tag `v1.17.0` → `ae31289`

---

# 后续轮 · D3 + D5：连接状态机与日志出口

## D3

- 新增 `server/src/gateway-links.ts`（195 行）：`LinkRouter` 承接 connect.request、accept/reject、signal、secure.handshake、transport.selected、relay counter 校验、`authorizeIce`。
- `gateway.ts` **556→417**；保留 `private get links()` 指向 router 的同一 Map，drop/disconnect/heartbeat/droppedLinks 无分裂。
- 新增 `server/tests/gateway-link-flow.mjs`（11 条真实 WS）：hello → connect.request → pending ICE 拒绝 → accepted → ICE 允许 → handshake 1/2 → relay → 重复 counter 触发 `INVALID_MESSAGE` 并 drop → ICE 再拒。
- D3 关闭；gateway 预算 417。

## D5

- `app.ts` 的 route_not_found 从 `console.warn` 改为 `Logger('http', settings.logLevel).warn('route_not_found', …)`。
- `policy.consoleExemptions` 清空；`console-containment` 在无豁免下通过。
- D5 关闭。

## 门禁

```
pnpm verify（57 s）  build ✓ check ✓ guard 12/12 ✓ test ✓
  protocol 94；server 322；合计 416 条断言，0 failed
pnpm test:pg 9 passed；Chromium 70/70；真 SMTP+OIDC 60/60
```

`reviewer-diff2`：**APPROVE**（0 P0/P1）；唯一 P2（连接状态机无本地用例）已由 `gateway-link-flow.mjs` 关闭。

---

# 目标轮 · D4：协议按帧/领域拆分

- 新增：
  - `packages/protocol/src/frames.ts`（150 行）：ControlFrame / RelayDataFrame / 各帧 payload 类型；
  - `packages/protocol/src/acp.ts`（103 行）：ACP 能力常量、endpoint 列表、ACP/Agent ACP 类型；
  - `packages/protocol/src/secure-message.ts`（113 行）：SecureMessageCodec 与分片常量。
- `index.ts` **1473→1118**；index 只保留 re-export、wire 编解码、schema 与协议辅助函数。
- `server/scripts/smoke-store.sh` 现在把 protocol 的全部 `*.d.ts` 复制进 smoke 包（index.d.ts 已相对 re-export frames/acp/secure-message）。
- 导出面：AST 对比 **242 exports 全等**，0 missing/0 added；runtime 127 个值一致；strict consumer 导入 7 个代表符号通过。
- 协议 9 套 94 tests、双端 walkthrough（真 PostgreSQL：connect/handshake/relay/counter/revoke）全绿。
- D4 关闭；protocol 预算 1118。

评审 `reviewer-diff2`：**APPROVE**；P2（预算 1124→1118、index 残留 4 个 secure 常量）已修。

## 门禁

```
pnpm verify（57 s）  build ✓ check ✓ guard 12/12 ✓ test ✓
  protocol 94；server 322；合计 416 条断言，0 failed
protocol-walkthrough（真库） PASS
```
