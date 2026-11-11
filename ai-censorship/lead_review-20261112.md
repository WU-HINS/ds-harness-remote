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
