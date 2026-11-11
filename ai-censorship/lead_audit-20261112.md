# 合同审计 · 第二轮 · 2026-11-12

- 对象：`feat/multi-user-auth` @ `f8afb2f`（第一轮修复提交），工作树含本轮修复
- 三路复审：contract（REJECT，1×P1）、security（REJECT，2×P1）、runtime（REJECT，同 2 项）
- 结论：第一轮 6 项修复全部验证通过；本轮新发现 **1 项 M5 违反（按 §6.1 P0）** 与 **1 项进程崩溃回归（P1）**，以及 1 项文档 P1，均已修复；剩余 P2 登记。

## 本轮 P0 / P1（已修）

### P0 · M5：设备 API 重命名不落审计

- 证据：`app.ts:586-596`（HEAD `f8afb2f`）只调用 `store.rename`，无 `store.audit`；同一事件经会话路径 `app.ts:514` 有 `device.renamed`。
- 复现：`git show HEAD:server/src/app.ts | sed -n '586,596p' | grep -c audit` → 0。
- 修复：`POST /api/v1/devices/:id/name` 补 `device.renamed`（actor=owner username，detail.via='device'）；`e2e-lifecycle` 新增 `[M5] bearer device rename is audited`。

### P1 · OIDC 登录的 fire-and-forget 审计可终止进程

- 证据：`app.ts:195` `void store.audit('oidc.success', …)`；上一轮移除 `audit()` 的内部 catch 后，该 Promise 无人处理。Node 22 默认 `--unhandled-rejections=throw`，`main.ts` 无 handler，一次审计 INSERT 失败会退出进程。
- 复现：失败 pool + `void store.audit(...)` → Node 退出码 1。
- 修复：把 `await store.audit` 移入 `finishOidc` 的 async 体（先审计后建会话），失败只让该次登录 500，不再拖垮进程；未重新加 catch。

### P1 · SSO-only 文档仍有两处与实现相反

- 证据：`docs/auth.md:40-42` 与 `README.md:60` 仍称「SSO-only 下密码不能作为设备凭据」；实现（`app.ts:401-417`）、测试（`e2e-account.mjs:67`、`e2e-journey.mjs:105`）与 `docs/api.md:23` 都说允许。
- 修复：`docs/auth.md` 改为「账号密码作为设备凭据，regardless of SSO-only」；`README` 表格同步；`root.ai.md` O7 明确「网页密码关闭，设备密钥与账号密码设备凭据仍可用」。

## 本轮 P2（已修）

| 问题 | 修复 |
|---|---|
| 管理员 PATCH 仅带 password 时仍写 `user.updated {disabled:true}` 假审计 | 仅在 `input.toggle === true` 时 setDisabled + audit；http-smoke 断言无假行 |
| 单写者租约 fail-closed 无默认套件测试（pg-mem stub 掩盖） | invariants-smoke 用 fake pool 断言连接失败上抛、`ok:false` → `INSTANCE_LOCKED` |
| 未登记审计动作的 500 把内部动作名回显给客户端 | `ApiError('INTERNAL_ERROR', 500)` 去掉 detail |
| 自撤销 actor 混用 deviceId 与用户名命名空间 | actor 改为 owner username，detail 保留 `self:true` |

## 剩余 P2（登记）

- **D12**：gateway `shouldQueue` 调用点无 WS 级回归。
- **D13**：app 665 / store 607 / gateway 621 / protocol 1473 全部 0 余量。
- **D14**：M4 每用户两层限流与 S1–S11 覆盖门禁未做。
- **D15**：发布线倒挂（v1.16.0–1.16.2 历史 tag vs 1.15.16 当前线）；下一版建议 1.17.0，或授权清理 1.16.x。
- 本轮修复提交在特性分支；CI 在 main / tag / PR 触发，裸分支 push 不触发，因此 HEAD 的 CI 证据要等 tag 或 PR。

## 门禁（本轮修复后）

```
pnpm verify（57 s）  build ✓ check ✓ guard 12/12 ✓ test ✓
  protocol 94；server 299；合计 393 条断言，0 failed
pnpm test:pg（PostgreSQL 15.19）  pg-smoke 9 passed
Chromium（真库）                 70/70
真 SMTP + OIDC 走查              60/60
```

针对性断言：

- `[M5] bearer device rename is audited`：actor=alice、userId、detail.via=device
- `[M5] device self-revoke is audited`：actor=alice、detail.self=true
- `[M5] unregistered audit actions are refused` / `audit failures are not swallowed`
- `lease acquisition failure is fatal` / `a second writer is refused`
- `a password-only PATCH does not fake a disable audit`

## 结论

第一轮 6 项修复全部验证；本轮 2 项 P0/P1 与 1 项文档 P1 已修，门禁全绿。未打新 tag；版本仍 1.15.16。**建议下一版用 1.17.0**（避开 1.16.x 倒挂），发布前由 CI 对 tag 复跑。

## 复审结果

- security 复审：**APPROVE**（10/10 清单通过；rename audit、OIDC await、admin toggle、lease 测试均实测）
- contract 复审：**APPROVE**（SSO-only 四处一致、D15 对 tag 历史成立、预算/计数/gate 无漂移）
- 复审后补：恢复被上一轮删除的 `admin password reset removed` 断言；修正审计报告里的 CI 触发描述
- 剩余 P2：D12–D15；审计可用性现在位于登录关键路径（失败返回 INTERNAL_ERROR，可考虑 503/readiness 提示）

## 审计闭环（2026-11-12）

- **P0**：0 项未关闭。第二轮 M5 设备重命名、审计失败吞异常均已修复并有用例。
- **P1**：0 项未关闭。OIDC audit await、SSO-only 文档四处一致，均由 security / contract 复审确认。
- **复审**：security **APPROVE**（10/10 清单）、contract **APPROVE**（SSO/D15/预算/计数无漂移）。
- **残余 P2**：D12（gateway WS 级中继回归）、D13（四个零余量文件）、D14（M4 两层限流 + S1–S11 覆盖门禁）、D15（发布线倒挂）。全部已登记在 root.ai.md §15。
- **代码状态**：HEAD `8343d4b`，工作树干净；修复已 push 到 `feat/multi-user-auth`。
- **发布状态**：修复尚未随 tag 发布；当前版本仍 1.15.16。按 D15，下一版应为 **1.17.0**。
- **最终门禁**：verify 394 断言（server 300 + protocol 94）、test:pg 9、browser 70/70、journey 60/60、guard 12/12。

结论：**审计闭环**。无未关闭的 P0/P1；P2 进入下一阶段目标。
