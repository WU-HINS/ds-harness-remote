# 合同审计 · 2026-11-11

- 审计对象：`feat/multi-user-auth` @ `b8fd01d`（v1.15.16），合同 `root.ai.md`（403 readLines）
- 三路独立审计：contract（REJECT，3×P1）、security（REJECT，1×P1）、runtime（APPROVE，4×P2）
- 结论：**按合同字面有 2 项 P0 级不变量违反 + 3 项 P1 文档失真，全部当次修复；剩余 P2 登记为 D12–D14。**

## P0（按 §6.1 / §14.5 字面）

### P0-1 · 设备自撤销不落审计（M5）

- 证据：`server/src/app.ts:565-568`，`DELETE /api/v1/devices/self` 只调用 `store.revoke`，没有 `store.audit`。
- 影响：同一事件经会话路径（`app.ts:518-520`）与管理员路径（`routes/admin.ts:153`）都有审计，唯独设备自撤销没有；取证链断裂。
- 修复：`await store.audit('device.removed', target.deviceId, device.userId, { deviceId: target.deviceId, self: true })`；`e2e-lifecycle.mjs` 新增 `[M5] device self-revoke is audited`，实测 actor=`alice-tablet`、userId=alice、detail.self=true。

### P0-2 · 审计写入失败被吞（§14.5）

- 证据：`server/src/store-pg.ts:607-609`，`INSERT INTO audit_log ... .catch(() => undefined)`。
- 影响：审计失败时请求仍返回成功，M5 退化为 best-effort，且违反「`catch {}` 吞异常 = P0」。
- 修复：移除 catch，失败上抛；`invariants-smoke.mjs` 用注入失败的 pool 断言 `[M5] audit failures are not swallowed`。

## P1（已修）

| # | 问题 | 证据 | 修复 |
|---|---|---|---|
| P1-1 | 合同头行基线仍是 1.15.14 | `root.ai.md:5` | 改为 1.15.16 / 生效 2026-11-11 |
| P1-2 | §2 的核对命令不递归，跑出 41/16 而非 53/34 | `root.ai.md:99-100` | 改为 `grep -rohE … server/src --include='*.ts'` |
| P1-3 | §6 新增端点五问仍写 33 个审计动作 | `root.ai.md:224` | 改为 34 |

## P2（本轮修复）

| 问题 | 修复 |
|---|---|
| 单写者租约获取失败时静默继续（S7 前提失效） | `acquireInstanceLease` 失败改为上抛（连接/查询失败均 fail-closed） |
| `createFirstAdmin` 把所有 DB 错误映射成 `SETUP_CLOSED` | 只把唯一键冲突映射为 409，其余上抛 |
| `docs/api.md` 说 SSO-only 下设备不能用账号密码，与实现/矩阵/测试相反 | 改为「密码是设备凭据，SSO-only 下仍允许」 |
| `audit()` 接受任意动作名，白名单无强制 | 新增 `AUDIT_ACTIONS`（34 个）封闭集，未登记动作抛 `INTERNAL_ERROR`；`[M5] unregistered audit actions are refused` |
| 测试「admin password reset removed」用管理员目标，409 来自 ADMIN_PROTECTED | 改为 PATCH 普通用户并断言旧密码仍可登录 |
| `/auth/refresh` 与表单 POST 无测试 | 生命周期新增 HTTP refresh；http-smoke 新增 urlencoded 登录 302 |
| 预算箭头混淆（1090/1089、799/770/612） | §4.3 与 D1/D2/policy 注明累计与最近一次 |
| 「gateway.ts 不写库」与去抖 `touch` 不符 | 改为「不直接写库，唯一写入是去抖 touch」 |
| §16 第 1 项已完成仍列为待办 | 标记完成，仅保留「从表生成文档骨架」 |

## P2（登记，未修）

- **D12**：`gateway.ts:413` 的 `shouldQueue` 调用点没有 WebSocket 级回归；改回 take-then-enqueue 仍可能全绿。
- **D13**：app 665 / store 607 / gateway 621 / protocol 1473 全部 0 余量；`file-budget` 在 equality 时无提示。
- **D14**：M4 的每用户请求/分钟与并发连接两层无具名用例；S1–S11 仍无覆盖门禁。

## 门禁（修复后）

```
pnpm verify（55 s）  build ✓ check ✓ guard 12/12 ✓ test ✓
  protocol 94；server 295
  合计 389 条断言，0 failed
DATABASE_URL=… pnpm test:pg   pg-smoke 9 passed，其余全绿
Chromium（真库）              70/70
真 SMTP + OIDC 走查           60/60
```

判别补充：

- `audit('ghost.action')` → `INTERNAL_ERROR`；注入失败的 pool → 上抛。
- 自撤销后 admin audit 出现 `device.removed`，actor/userId/detail.self 全部匹配。
- `route-doc-sync` 仍 33 精确 / 6 家族；`invariant-coverage` 19/19。

## 结论

合同不变量在修复后重新成立；本次审计未发现凭据泄漏、越权或数据损坏。**建议以 1.15.17 发布这批修复**（当前分支尚未 bump 版本、未打 tag）。

## 复核

- contract auditor：3×P1（已逐条修）
- security auditor：1×P1（自撤销审计）+ 7×P2（已修 4、登记 3）
- runtime auditor：0 P0/P1，4×P2（refresh/form 已补，gateway 调用点与零余量登记）
