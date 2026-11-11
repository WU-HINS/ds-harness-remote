# lead — 评审记录 2026-11-10

- 范围：为仓库引入工程约束（`root.ai.md`）与静态门禁（`scripts/guard`），并核对现有实现。
- 基线：`1.15.14` / 协议 `0.5.21`，分支 `feat/multi-user-auth`。
- 结论：**无 P0**。4 项 P1 全部当次关闭；4 项 P2 登记为债务。

## 证据

```
node scripts/guard/index.mjs        # 10 rules, 0 violation(s)
pnpm -r check                      # protocol ✓ server ✓
pnpm -r test                       # server 9 套冒烟 + protocol 9 套（94 tests）
grep -ohE "new ApiError\('[A-Z_]+'" server/src/*.ts | sort -u | wc -l   # 53
grep -ohE "audit\('[a-z_.]+'" server/src/*.ts | sort -u | wc -l          # 33
```

## P1（已关闭）

### P1-1 文档承诺了两个不存在的端点

- 证据：`docs/api.md:43-44` 记载 `GET/POST /api/v1/admin/users/:id/device-keys` 与
  `DELETE /api/v1/admin/device-keys/:id`；`server/src/app.ts` 中不存在这两个路由
  （管理端用户正则只到 `/api/v1/admin/users/:id`，且 `:id` 的 `PATCH`/`DELETE` 都要求 `!match[2]`）。
  `grep -rn "admin/device-keys" server/src` 无结果。
- 影响：文档把未实现能力写成已实现，客户端据此接入直接 404；属 §11「对外承诺失真」。
- 处置：按代码事实重写 `docs/api.md`，删除两条不存在的端点，补齐实际存在的
  `/api/v1/account/device-keys`、`/api/v1/account/devices/:id` 等 8 条遗漏。
- 防回流：`route-doc-sync` 双向比对，文档多写或代码漏写都会失败。

### P1-2 协议包的 9 套用例从未被执行，其中 5 套已静默腐化

- 证据：根 `package.json` 的 `test` 曾是 `pnpm --filter @dsh-remote/server test`，CI 只跑 `pnpm test`；
  `packages/protocol/tests` 的 9 个文件因此从未在 CI 运行（`pnpm -r check` 只做类型检查）。
  把根 `test` 改为 `pnpm -r test` 后立刻暴露：5 套用例加载失败，报
  `Failed to load url ../../../scripts/test-scenarios.mjs`；`conformance-fixtures` 报
  `ENOENT fixtures/protocol/v1/manifest.json`。
- 根因：`b08a746 refactor: standalone server repository` 把共享 monorepo 拆成独立仓库时，
  漏掉了测试基建 `scripts/test-scenarios.mjs` 与 `fixtures/protocol/v1/`，而根门禁不跑协议用例，
  所以没有任何信号。
- 处置：从 `f01b4d2` 恢复 `scripts/test-scenarios.mjs`（31 行，零依赖）与
  `fixtures/protocol/v1/`（11 个文件）；根 `test` 改为 `pnpm -r test`；
  `test-wiring` 新增「测试里的相对导入必须可解析」，指向不存在的模块即失败。
- 证据（修复后）：`packages/protocol` 9 files / **94 tests passed**；server 9 套冒烟全绿。
- 判别测试：在 `packages/protocol/tests` 放一个导入 `../../../scripts/ghost-scenarios.mjs` 的探针文件，
  `test-wiring` 立即变红；删除后恢复绿。

### P1-3 不存在任何静态不变量检查

- 证据：提交前只有 build/check/test，没有任何机制阻止「SQL 出现在路由层」「console 绕过 logger」
  「文档与路由漂移」「文件无限膨胀」「测试无人执行」。
- 处置：新增 `scripts/guard`（10 条规则）、`pnpm guard`、`pnpm verify`，CI 的 quality job 增加 `pnpm guard`；
  契约文件同时在仓库根与工作区根落地，两份由 `root-mirror` 规则校验一致性（只改镜像会立即失败）。
- 判别测试（注入 → 变红 → 撤回）：

  | 注入 | 结果 |
  |---|---|
  | `server/src/__guard_selftest.ts` 含 `DELETE FROM users` 与 `console.log` | `sql-containment`、`console-containment` 失败 |
  | `docs/api.md` 追加 `/api/v1/ghost` | `route-doc-sync` 失败 |
  | 测试文件导入不存在的模块 | `test-wiring` 失败 |
  | 撤回全部注入 | 9 条规则全绿 |

### P1-4 `docs/api.md` 与实现整体脱节（8 条端点缺失）

- 证据：`route-doc-sync` 首次运行列出 9 条「代码有、文档无」，其中 6 条是真实对外端点，
  3 条是历史 OAuth 探测。文档停留在旧版管理端模型。
- 处置：重写 `docs/api.md`，按 5 个分区给出准确的方法、路径与用途；遗留 OAuth 探测单列一节
  并写明「不是受支持面」。

## P2（登记，不改本次行为）

| # | 问题 | 证据 | 退出条件 |
|---|---|---|---|
| 1 | `server/src/app.ts` 1090 行，分发/handler/页面装配混在一处 | `wc -l` | 拆出路由表与 handler，≤700 行 |
| 2 | `server/src/store-pg.ts` 799 行 | `wc -l` | 按领域拆分，事务边界不变 |
| 3 | `server/src/gateway.ts` 677 行 | `wc -l` | 拆出帧校验与状态机 |
| 4 | `packages/protocol/src/index.ts` 1473 行 | `wc -l` | 按帧类型拆分，导出面不变 |

## 另外观察到

- `server/src/app.ts` 仍有 1 处 `console.warn`（route_not_found 兜底），已作为豁免登记在
  `scripts/guard/policy.json`，上限 1，接入 logger 后删除（D5）。
- 管理端用户正则接受 `/api/v1/admin/users/:id/device-key`（单数）但无处理器，命中后落入
  `METHOD_NOT_FOUND`。死分支，建议拆分 `app.ts` 时删除。
- CSP 的 `style-src 'unsafe-inline'` 与「禁止内联」的表述不一致，已登记 D6。

## 未做

- 未运行 `pnpm test:pg`：需要真实 PostgreSQL（CI 的 `server-postgres` job 覆盖）。
- 未运行两个 walkthrough 脚本：需要双端进程与数据库。

---

# 第二轮（2026-11-10 晚）· 契约提权 + 定位固化

## 结构性变更

| # | 变更 | 证据 |
|---|---|---|
| 1 | 契约提权到项目根：\`root.ai.md\` 现在位于工作区根，仓库内的是生成镜像 | \`root-mirror\` 通过（397 行一致）；\`pnpm guard --sync\` 可重建 |
| 2 | 新增 §0.1 定位与边界、§0.2 与上游的兼容契约 | 上游 = liguobao/ds-harness-remote（完整协议），本仓库 = 服务端最小面实现 |
| 3 | 新增 §6.1 C1/C2/C3 不变量（O1–O7、M1–M5、K1–K6） | 逐条附 \`file:line\` 依据 |
| 4 | 新增 guard 规则 \`fork-surface\`：每条 \`/api\` 路由必须有已登记的能力家族 | 11 条规则全绿 |
| 5 | 路由提取从 \`/api/v1\` 放宽到 \`/api/\`，否则 \`/api/v2\` 家族会同时绕过两条规则 | 判别测试见下 |

## P0（已关闭）

### P0-1 安全文档与实现相反：设备密钥不是"只存摘要"

- 证据：\`docs/security.md\` 原文「Device keys: only digests stored; plaintext shown once at creation」；
  实现是 \`device_keys.secret\` 存 AES-256-GCM 密文，\`listDeviceKeys\` 对未吊销密钥返回明文
  （\`server/src/store-pg.ts\` 的 \`sealSecret\`/\`openSecret\`），\`docs/auth.md\` 也写「stored encrypted so it can
  be shown again」，用例 \`4c owner can reveal the key\` 断言可再次查看。
- 影响：安全文档对「拿到数据库会不会泄漏密钥」给出错误结论；运维按此评估备份风险会低估。
- 处置：按实现重写 \`docs/security.md\` 的 Credential handling；\`docs/operations.md\` 的备份说明改为「备份
  含密封密钥与派生密钥，等同完整凭据」；契约 §6 S3 与 §6.1 K2 同步改写，并把该取舍写成显式债务闭环 D8。

## P1（已关闭）

### P1-5 管理端密钥接口：移除是有意的，文档是残留

- 证据：\`server/tests/e2e-lifecycle.mjs:45-46\` 与 \`server/tests/http-smoke.mjs:97-99\` 断言
  \`/api/v1/admin/users/:id/device-keys\` 返回 **404**，用例名为 \`admin key APIs are gone\` / \`admin cannot read
  user keys\`；代码里没有该路由。上一轮删文档是对的，本轮补上「为什么」：这是 C3 的 K4 不变量。
- 处置：契约 §6.1 的 K4 明确写死「管理员永远不可读取/铸造/吊销他人密钥」。

## P2（新增）

| # | 问题 | 退出条件 |
|---|---|---|
| D9 | 上游协议基线只有 \`fixtures/protocol/v1\` 作证，没有钉上游提交号 | 在 \`fixtures/protocol/v1/manifest.json\` 记录所对齐的 commit |

## 判别测试（新规则必须会红）

| 注入 | 结果 |
|---|---|
| 在 \`app.ts\` 插入 \`path === '/api/v2/workspaces'\` | \`fork-surface\` 红：路由没有能力归属；\`route-doc-sync\` 红：未文档化路由 |
| 手改 \`repo/root.ai.md\`（追加一行） | \`root-mirror\` 红：镜像与项目根版本不一致 |
| \`pnpm guard --sync\` | 镜像重建，\`root-mirror\` 恢复绿 |
| 撤回全部注入 | 11 条规则全绿 |

## 复核

\`\`\`
pnpm verify        # build → check → guard(11) → test(server 9 套 + protocol 94)
\`\`\`

---

# 第三轮（2026-11-10 晚）· 设备密钥回显成为硬契约

## 需求

「设备密钥要求是可回显」——所有者必须能随时读回同一把密钥的明文。

## 现状核对（实现已具备，契约与接口不完整）

| 事实 | 证据 |
|---|---|
| 密钥以 AES-256-GCM 密封副本存库，可解密 | \`server/src/store-pg.ts\` 的 \`sealSecret\`/\`openSecret\` |
| 所有者列表接口对未吊销密钥返回明文 | \`listDeviceKeys\` |
| 用例断言可再次查看 | \`server/tests/e2e-lifecycle.mjs\` 的 \`4c owner can reveal the key\` |
| 缺陷 1：接口没有 \`revealable\` 字段，客户端无法区分「不可回显」与「未加载」 | 旧响应仅有 \`key\` 或缺失 |
| 缺陷 2：迁移遗留密钥（\`secret\` 为 NULL）在界面显示「不可查看（旧密钥）」，无操作指引 | \`web/src/pages/keys.js\` |
| 缺陷 3：契约只写「所有者可再次查看」，没有可判定的判据 | 旧 §6.1 K2 |

## 处置

1. **契约**：§6.1 K2 改写为「所有者必须能回显，返回 \`key\` 且 \`revealable: true\`」；新增 **K7 回显契约**：未吊销 → 必带 \`key\`；已吊销或无密封副本 → \`revealable: false\` 且不带 \`key\`，界面必须说明并给「新建 + 吊销」路径，**不得静默留空**；新增密钥的代码路径不得造出不可回显的活密钥。§0.1 的 C3 同步加「可回显」。
2. **接口**：\`listDeviceKeys\` 增加 \`revealable\`；\`key\` 仅在可回显时出现。\`store-pg.ts\` 保持 **799 行未破预算**（压缩两处 SQL 换行，不申请扩预算）。
3. **界面**：\`keys.js\` 三态区分——未绑定密钥显示「—」、已吊销显示「已吊销，不可回显」、历史无密封副本显示「不可回显（旧密钥）· 请新建一把并吊销此钥」。
4. **文档**：\`docs/api.md\` 的 Device 段新增 \`revealable\` 说明。
5. **用例**（\`server/tests/store-smoke.mjs\`）：
   - \`live key echoes back unchanged\`：明文逐字节一致；
   - \`revoked key refuses to echo\`：吊销后无 \`key\`、\`revealable:false\`；
   - \`legacy key is flagged, never blank\`：\`secret IS NULL\` 的行被标记而不是空白。

## 债务

| # | 问题 | 级别 | 退出条件 |
|---|---|---|---|
| D10 | 迁移遗留密钥只能标记，没有轮换入口（\`rotateDeviceKey\` 未暴露 HTTP） | P2 | 暴露轮换端点，或把「新建 + 吊销」做成一步引导 |

## 复核

\`\`\`
pnpm verify   # guard 11 条 0 违反；protocol 94 tests；server 8 套（store 28 断言含 3 条回显用例）
\`\`\`

---

# 第四轮（2026-11-10 晚）· 普通账号中继带宽全局限速 5 MiB/s

## 需求

服务端规划上对普通用户做全局限速，避免单个账号挤压业务：**合计 5 MiB/s**。

## 现状

只有三层限流：每用户请求/分钟（令牌桶）、每用户并发连接数、每 IP 匿名限流；外加每连接每秒帧数与字节的**防洪**闸门
（\`server/src/gateway.ts\`，只防突发，不约束持续吞吐）。**没有跨连接的带宽预算**，一个账号开满 16 条连接即可跑满上行。

## 处置

| 层 | 改动 |
|---|---|
| 新模块 | \`server/src/relay-budget.ts\`：\`RelayBudget\` 令牌桶（容量 = 1 秒额度，按字节计），\`normalizeRelayBytesPerSecond\` 做范围归一（NaN/负数回落默认，0 = 关闭，上限 1 GiB/s） |
| 网关 | 建立 \`relayBudget\`；\`relay\` 帧转发前扣减；账户角色在 hello 时解析并缓存到 peer（管理员豁免）；超限抛 \`RATE_LIMITED\`（关闭该连接而不是丢帧——丢帧会破坏对端顺序语义） |
| 配置 | \`DSH_SERVER_RELAY_BYTES_PER_SECOND\`，默认 \`5242880\`；\`settings.ts\` → \`app.ts\` → \`GatewayOptions.relayBytesPerSecond\` |
| 文档 | \`docs/configuration.md\` 新增 Relay budget 段；\`docs/security.md\` 说明"关闭而非丢帧"的原因 |
| 契约 | §2 基线新增中继带宽行；§6.1 M4 升级为"三层限流 + 中继带宽"；§4.3 预算表登记 gateway 677→688 |
| 用例 | 新增 \`server/tests/budget-smoke.mjs\`（14 条断言），已登记到 \`smoke-store.sh\` |

## 设计取舍

1. **共享桶 vs 每用户桶**：需求是"全局 5 MiB"，实现为服务端一个共享桶（管理员豁免）。代价是滥用者可以耗尽共享额度；缓解手段是日志里带 \`peerId\`，并保留升级为"全局 + 每用户子桶"的余地。
2. **超限关闭而非丢帧**：中继帧带严格 counter 顺序，丢帧会让对端把它当协议违规。宁可断开并让客户端重连。
3. **预算棘轮**：\`gateway.ts\` 677→688，按 §4.3 的正规流程登记（含退出条件 D11），不是静默上调；\`file-budget\` 现在会把预算说明打进门禁输出。

## 债务

| # | 问题 | 级别 | 退出条件 |
|---|---|---|---|
| D11 | \`gateway.ts\` 677→688；角色解析使消息处理器变为 async | P2 | 抽出 \`gateway-admission.ts\`（帧准入 + 带宽 + 角色），预算回落到 ≤660 |

## 复核

\`\`\`
pnpm -r check   # protocol ✓ server ✓
pnpm -r test    # budget 14 断言 + store 28 + http 59 + e2e 32/23/18/15/12
\`\`\`

---

# 第五轮（2026-11-10 晚）· 中继带宽改为「账号共享权重、占用越多权重越低」

## 需求

多账号共享同一份中继带宽，单位时间内占用越多，权重越低（而不是先到先得）。

## 为什么上一版不够

上一版是**单个共享令牌桶**：谁先发谁拿到，一个账号开满连接就能把 5 MiB/s 吃光，其他人一起被限。这正是当时在评审里写下的已知代价（"滥用者可以耗尽共享额度"），本轮按需求把它换成加权分配。

## 模型

- 每个普通账号维护平滑吞吐 \`rate\`（时间衰减的 EWMA，约 1 秒窗口）。
- 权重 \`weight = 1 / (1 + rate / B)\`：空闲 = 1，跑满 B = 0.5，跑 10×B ≈ 0.09。
- 份额 \`share = B × weight / Σ weight\`：份额之和恒等于 B；**只有一个活跃账号时它拿满 B**（公平只在有人可被公平对待时才有意义）。
- 每个账号持有 \`max(share, 64 KiB)\` 的桶，按 \`share\` 速率补充；新账号首次取用时装满一桶（允许一次 1 秒突发，而不是被瞬拒）。
- 超出自身份额 → 以 \`RATE_LIMITED\` 关闭该连接（不丢帧：中继帧带严格 counter，丢帧会让对端判定协议违规）。
- 静默 30 秒左右权重基本恢复；超过 256 个账号时惰性清理长期空闲状态。
- 管理员豁免；\`DSH_SERVER_RELAY_BYTES_PER_SECOND=0\` 整体关闭。

## 证据

\`\`\`
server/tests/budget-smoke.mjs（16 条断言）
PASS sole account owns the budget
PASS heavy account gets a smaller share :: 1502 < 98498
PASS shares add up to the budget :: 100000.00000000001
PASS weight recovers after idle time :: 9310 > 1502
PASS long idle time almost fully restores the share :: 50000
PASS a single oversized frame is admitted / the next frame is refused
\`\`\`

## 边界

1. 权重是**相对**的：单账号场景下限速退化为"整份预算"，这是设计而非缺陷。
2. 份额低到 \`B/(1+Σrate/B)\` 时仍可能小于一帧；桶的最小容量 64 KiB 与"超额按容量计费"保证不会出现永远无法通过的单帧。
3. 关闭而非排队：真正的平滑需要给中继加发送队列（会改变顺序与内存模型），不在本轮范围；若后续要做，先补协议层的重传语义。

---

# 第六轮（2026-11-10 晚）· 中继发送队列：把"超限即断开"换成"超限即排队"

## 需求

给中继加发送队列。

## 为什么必须排队而不是丢

中继帧的 payload 带严格 counter，接收端把缺口当协议违规。所以"限速"只有三种实现：丢（破坏语义）、
断开（用户体验差）、**排队（本轮）**。排队能保住顺序，代价是内存与延迟，因此队列必须有界。

## 实现

| 组件 | 行为 |
|---|---|
| \`server/src/relay-queue.ts\` | 每设备 FIFO：\`push\` 检查 32 帧 / 256 KiB 上限；\`drain\` 按当前可用额度逐帧投递，保持顺序；记录队首等待时长 |
| 网关 | 超出账号份额 → \`enqueueRelay\` 而不是抛错；25ms 定时器 \`drainRelayQueues\` 投递；队列空即回收状态 |
| 触发断开 | 只有两种：队列溢出（\`push\` 返回 false）、队首等待超过 15 秒（\`relay_queue_stalled\` 日志 + 断开） |
| 兜底 | 投递回调包 try/catch：链路在此期间已死的帧不能把定时器炸掉 |
| 清理 | \`disconnect\` 删除该设备队列；\`close\` 清空全部队列并停表 |

## 证据

\`\`\`
server/tests/relay-queue-smoke.mjs
PASS push accepts frames while there is room
PASS drain stops when credit runs out
PASS delivery preserves order :: [0]
PASS remaining frame follows in order :: [0,1]
PASS frame limit rejects the overflow
PASS byte limit rejects the overflow
PASS stalled queue reports a stall
PASS clear drops everything
\`\`\`

## 预算

\`gateway.ts\` 677 → 733（两次上调）。按 §4.3 登记并在门禁输出里可见；D11 升级为 **P1 并封顶**：
截止 0.2.0 抽出 \`gateway-admission.ts\`，期间**禁止再次上调**。这是棘轮该有的样子——允许一次有理由的
上调，但把"下一次"变成必须重构。

## 已知边界

- 队列是**每设备**的，份额是**每账号**的：一个账号多台设备时，各队列独立排队、共享同一份额，符合"账号共享权重"的语义。
- 25ms 排空间隔带来最多 25ms 的额外延迟，低于一次人类可感知的交互阈值；不做自适应。
- 排队不等于拥塞控制：发送端仍以原速写入，队列满后依然是断开。真正的端到端背压需要协议层暂停/恢复语义。

---

# 第七轮（2026-11-10 夜）· 关闭 D11：把帧准入 / 带宽 / 队列抽出网关

## 触发

`root.ai.md` §15 的唯一 P1 债务 D11：`gateway.ts` 两次上调到 733 行，契约封顶「截止 0.2.0，期间禁止再次上调」。
继续开发前必须先拆，否则下一个网关改动只能靠第三次扩预算——那正是棘轮要禁止的事。

## 变更

| 文件 | 内容 |
|---|---|
| `server/src/gateway-admission.ts`（新，268 行） | `FrameAdmission`（每秒帧/字节窗口、掉线帧独立额度）、`DroppedLinkRegistry`（TTL/每主机/总量上限的墓碑表）、`RelayAdmission`（加权预算 + 每设备有序队列 + 25ms 排空）、`GatewayAdmission`（一个字段、一个生命周期） |
| `server/src/gateway.ts` | 733 → 620 行（`wc -l`）。删除 4 个掉线链路方法、`enqueueRelay`/`drainRelayQueues`、闭包内的窗口计数；只保留 `admission.frameWindow()` 与 `admission.relay.*` 调用 |
| `server/tests/admission-smoke.mjs`（新） | 24 条断言：窗口复位/上限、排队后不得越队、掉线帧额度、墓碑过期与驱逐、队列顺序、溢出拒绝、15s 停滞、forget/close |
| `scripts/guard/policy.json` | `gateway.ts` 预算 733 → **621**（只降不升）；`budgetNotes` 记录来源 |
| `root.ai.md` | §4.3 预算 621，并补充行数口径（readLines，含末尾空行）；D11 → 已关闭；D3 更新为 621 行（连接状态机仍在）；§2 Store 方法数修正为 69（57 公开 / 12 私有）；§2 测试栈 9→12 套（上一轮新增 budget/queue，本轮新增 admission；`pg-smoke` 条件执行）；M4 证据加入 `gateway-admission.ts`；**§5.7 与 §6.1 S3/K2 的矛盾修正**（原文仍写「设备密钥只存摘要」，与可回显实现相反） |
| `fixtures/protocol/v1/manifest.json` | 钉上游提交（D9）：`14037e78f45e14f7a5ad56c2266944548def7e3d`，协议包 0.5.21；README 记录来源 |

## 等价性论证（逐条对照旧实现）

| 行为 | 旧位置 | 新位置 | 判据 |
|---|---|---|---|
| 每秒窗口复位 + `frames+dropped` 共享上限 | `gateway.ts` message 闭包 | `FrameAdmission.begin/count/countDropped` | 保留原短路顺序（超帧数时不再累加字节） |
| 掉线链路 300s 墓碑、每主机 64、总量 16384、驱逐时回写 `evictedTombstoneUntil` | `pruneDroppedLinks/evictDroppedLink/recordDroppedLink/isDroppedLinkFrame` | `DroppedLinkRegistry` | `onEvict` 回调把两个 peer 的墓碑时间取最大值 |
| 加权预算扣减、队列 `take` 用账号 ownerId | `enqueueRelay` 闭包 | `QueueEntry` | 每设备队列捕获创建时的 ownerId（与旧闭包一致） |
| 队列顺序、32 帧/256 KiB 上限、溢出抛 `RATE_LIMITED` | `RelayQueue` + `enqueueRelay` | 不变，`RelayAdmission.enqueue` 返回 false，网关抛错 | 新增断言 `a queue overflow is refused at 32 frames` |
| 队首 >15s → 记录 `relay_queue_stalled` 并断开 | `drainRelayQueues` | `onStalled` 回调 | 断言 `a stalled queue reports and is dropped` |
| 投递前校验 peer 身份，异常不断定时器 | 旧 `deliver` 闭包 | `enqueue(..., replay)` 捕获同一 peer 对象 | 回调内 `this.peers.get(active.id) !== active` 直接返回 |
| `disconnect` 删队列、`close` 清空并停表 | 网关 | `forget` / `GatewayAdmission.close` | 断言 `forget drops a device queue`、`close is idempotent` |

## 门禁证据

```
$ pnpm verify
build ✓  check ✓  guard: 11 rules, 0 violation(s)  test ✓
  file-budget: gateway.ts — 733→621：抽出 gateway-admission.ts（帧窗口 / 带宽 / 队列），D11 已关闭；预算 621 只降不升
  protocol: 9 files / 94 tests passed
  server: admission 24 · budget 16 · queue 11 · store 28 · runtime 16 · http 59 ·
          lifecycle 32 · auth 23 · oidc 18 · account 15 · journey 12  = 254 passed, 0 failed
合计 348 条断言全绿；build+check+guard+test 耗时 65 s
```

**未跑**：`pnpm test:pg`（需要真实 PostgreSQL，本机未起库；本轮不改 SQL 语义，但 `store-pg.ts` 有既有未提交改动，
建议合并前在 CI 的 server-postgres job 复核）。**未跑**：协议双端走查（本轮未改 `packages/protocol`）。

## 判别测试（实际执行，非口头声明）

1. **预算棘轮**：临时把 `policy.json` 的 `gateway.ts` 预算降到 620，`file-budget` 变红：

   ```
   ✗ server/src/gateway.ts:621 621 行，超出预算 620 行 (+ 1)
   guard: 1 rules, 1 violation(s)
   ```

   恢复 621 后 `1 rules, 0 violation(s)`。
2. **队列上限**：在编译产物 `server/.smoke/build/relay-queue.js` 中移除帧数上限判断，重跑 admission-smoke：

   ```
   FAIL a queue overflow is refused at 32 frames :: 0
   FAIL queued frames drain when credit returns :: []
   ```

   恢复后 `24 passed, 0 failed`。证明新增断言对「队列无界」有判别力。

## 问题分级

- P0：无。
- P1：无（D11 本轮关闭；§5.7 的契约自相矛盾按 P1 当次修正）。
- P2：D10 仍开放（无密封副本的旧密钥没有轮换入口）；`gateway.ts` 仍含连接状态机（D3）。

## 审核团

两个独立只读评审（reviewer-diff / reviewer-contract）并行复核，结论见各自评审文件；未通过前不提交。

## 独立评审发现的 P1（已修）

`reviewer-diff2` 拒绝上一版，指出**排队帧会被后续小帧越过**：

- 现场：`gateway.ts` 先 `relay.take()`，只有额度不足才入队。若设备已有待发队列，而预算恰好回补了
  一小段额度，新帧会直接 `handle()` 前进，排队中的旧帧随后到达时 `counter` 已过期 →
  `INVALID_MESSAGE` → 重放守卫断开整条控制连接。这正是队列注释声称要避免的计数器缺口。
- 修法：新增 `RelayAdmission.shouldQueue(peerId, ownerId, bytes)`——**队列非空即入队**，只有无队列且
  有额度才直发。网关条件改为 `shouldQueue(...)`。
- 回归：`admission-smoke` 新增两条——`a device with a pending frame keeps queueing after credit returns`、
  `a later frame cannot overtake the queued one`（顺序 `[0,1]`）。

同时修掉两个 P2：

| 问题 | 修法 |
|---|---|
| 排队帧的链路已死时，重放 `CONNECTION_NOT_FOUND` 被升级为断开整个控制连接 | 重放捕获只在**不是** `CONNECTION_NOT_FOUND` 时断开；死链的排队帧视为过期流量 |
| hello 分支 `await findUserById` 后未复检状态，且同一 chunk 的第二个 hello 可重入 | 增加 `helloInFlight` 一次性门；await 后复检 `state === 'awaiting_hello'`，否则直接返回 |

剩余 P2（接受）：hello 解析管理员角色需要一次 `findUserById` 查询；查询失败会以 `INVALID_MESSAGE` 关闭连接。
角色只用于带宽豁免，代价可接受；若后续引入用户缓存，应改为缓存读取。

## 独立复核

- `reviewer-contract`：**APPROVE**（D9 关闭、Store 69/57/12、12 套测试、行数口径、D11 677→621 均逐条命令复核；guard 11/11）。
- `reviewer-diff2`：首轮 **REJECT**（上述 P1 + 3 个 P2）；修复后 **APPROVE**——counter-gap 关闭，admission 24/24、queue 11/11、budget 16/16，源码级探针确认「有队列即排队、每帧只扣一次」。遗留两条 P3（注释指向旧行为、排队帧在投递时校验 link 状态），均已记录；注释已修。

---

# 第八轮（2026-11-11）· D10 轮换端点 + 密钥密封抽出，发版 1.15.15

## 触发

D11/D9 关闭后，债务表里最接近用户痛点的 P2 是 D10：迁移遗留密钥（无密封副本）只能显示「不可回显」，
没有出路。契约给的退出条件是「暴露轮换端点，或界面把新建 + 吊销做成一步引导」——选端点，因为
新建 + 吊销会断开已绑定设备，而轮换可以原地保留绑定。

同时 `store-pg.ts` 798/799 已顶格，加 14 行就会破预算，因此先把密钥密封（HKDF + AES-256-GCM +
验证码 HMAC）抽成 `server/src/secret-box.ts`，再落轮换方法。

## 变更

| 文件 | 内容 |
|---|---|
| `server/src/secret-box.ts`（新，60 行） | `SecretBox`：`codeKey` / `deviceKeyKey` / `seal` / `open` / `codeDigest`，状态仍来自 `server_settings.code_secret` |
| `server/src/store-pg.ts` | 798 → 773 行；删除 5 个私有加密方法，构造时注入 `SecretBox` 的读写回调；新增 `rotateDeviceKeyById`（替换未使用的 `rotateDeviceKey`） |
| `server/src/app.ts` | 新增 `POST /api/v1/account/device-keys/:id/rotate`：owner-only，成功返回 `{ id, label, key, revealable: true }`，审计 `device_key.rotated` |
| `web/src/pages/keys.js` | 活密钥行新增「轮换」；不可回显的旧密钥在密钥列直接给「轮换」（不再让用户自己新建 + 吊销） |
| `web/src/pages/admin.js` | 审计动作中文映射补 `device_key.rotated = 轮换设备密钥` |
| 文档 | `docs/api.md` 增加路由与语义（保留 id/绑定、旧密钥立即失效、跨账号 404）；`docs/auth.md` 说明轮换与遗留密钥出路 |
| 契约 | §2 审计动作 33→34；Store 方法 69/57/12 → 64/57/7；§4.3 store 799→774、app 1090→1089；K7 改为「轮换入口」；D10 → 已关闭；版本 1.15.15 |

## 语义

- **保留**：`device_keys.id`、`label`、`devices.device_key_id` 绑定、已签发的 device token。
- **失效**：旧明文立即不能用于 `/auth/login` 或 `device-login`（哈希被替换）。
- **不接受**：已吊销密钥、他人密钥（统一 404 `DEVICE_KEY_NOT_FOUND`）。
- **审计**：`device_key.rotated` 带 `keyId`，出现在后台审计表。
- **不回显旧值**：轮换后只返回新明文；旧明文不在响应、日志或审计 detail 中出现。

## 证据

```
pnpm verify（67 s）  build ✓ check ✓ guard 11/11 ✓ test ✓
  protocol 9 files / 94 tests
  server 270：admission 24 · budget 16 · queue 11 · store 35 · runtime 16 · http 59 ·
              lifecycle 41 · auth 23 · oidc 18 · account 15 · journey 12
  合计 364 条断言，0 failed

DATABASE_URL=postgres://… pnpm test:pg
  pg-smoke 9 passed；其余套件同上（真 PostgreSQL 15.19）

Chromium（browser-check，真库 dsh_browser2）     70/70
  PASS key rotation swaps the secret in place :: 66-kwN9h ≠ GxRsBIIo
  PASS audit actions read Chinese
全业务走查（真 SMTP + 真 OIDC + Chromium）        60/60
```

## 判别测试

- store：`rotation issues a new secret`、`the rotated-away secret stops working`、`other account cannot rotate`；
- HTTP：old secret 401 / new secret 200、他人 404、已吊销 404、审计表含 `device_key.rotated`；
- 浏览器：点「轮换」→ 确认 → 同一条目重新显示的新明文 ≠ 轮换前的明文（断言在 `browser-check.mjs`）。

## 过程中修掉的两个真问题

1. **审计中文断言变红**：浏览器测试第一次跑出 `FAIL audit actions read Chinese`——新动作没有中文映射，
   后台审计表直接显示 `device_key.rotated`。已补映射并复跑 68/68。这条断言有判别力。
2. **测试自身的 cookie 传法错误**：轮换请求把 `cookie` 放在 fetch 顶层而不是 `headers`，导致 401；
   修正后通过。不是产品缺陷，但记录在此避免复发。

## 发现并记录

- 打开 `onlySso` 会清除除操作者外的所有会话（`app.ts` 的 `clearOtherSessions`）。全业务走查的轮换段因此
  先用密码重新登录 alice；这不是缺陷，是 SSO 切换的预期语义，但测试必须遵守。

## 问题分级

- P0：无。
- P1：无（新端点按 §6 五问逐条核对：owner 会话、越权 404、用户级限流、审计、失败不吞）。
- P2：D2 仍开放（store 仍混合连接/认证/设备/审计/设置）；D1（app 路由表）仍开放。

## 发布

版本 1.15.15（三处 `package.json` 同步），tag 由提交后推送触发；镜像与 Release 结果在推送后核对。

## 独立评审（本轮）

| 评审 | 结论 | 关键证据 |
|---|---|---|
| `reviewer-rotate` | **APPROVE**（无 P0/P1，4×P2） | owner-only 他人/随机 id 均 404 且响应同形；旧秘密 401、新秘密 200；真实绑定设备 `deviceCount` 1→1、FK 不变、refresh token 仍有效；审计只带 keyId；跨站 POST 403、匿名 401 |
| `reviewer-store` | **APPROVE**（无 P0/P1，2×P2 + 2 可选） | 与抽取前逐项对比：HKDF 参数、AES-GCM 布局（iv12‖tag16‖ct）字节兼容，旧密封行可被新 `SecretBox` 打开、新密封行可被旧实现打开；code_secret 冷启动只写一次；Store 64/57/7；无 SQL 外溢；guard 11/11 |

按评审修掉的 P2：

1. **同一行两个「轮换」按钮**（遗留密钥的密钥列 + 操作列）→ 只保留操作列，并保留 `aria-label`。
2. **「保留绑定」只有构造性论证、没有用例** → store 新增真实注册设备后轮换，断言 `device_key_id` 不变（store 34→35）。
3. **浏览器层没覆盖 D10 的真实状态** → browser-check 直接向真库插入一条 `secret IS NULL` 的遗留密钥，断言先显示「不可回显（旧密钥）」，点「轮换」后变成可回显（68→70 条）。
4. **轮换与 legacy 列回写非原子，且该列已是死列** → 删除 `users.device_key_hash` 回写（`verifyDeviceCredential` 只查 `device_keys`），同时去掉一次重复 digest；store 774→770。
5. **行数口径 off-by-one** → `799→770`（预算单位），D2 改为 770（readLines），与 §4.3 规则 5 一致。

## 发布结果（推送后核对）

- CI run 42987159407：Check and test ✓ / Build image (no push) ✓ / Store smoke on PostgreSQL ✓
- Release run 42987159453：Validate tag against package version ✓ / Create GitHub release ✓ / Publish image ✓
- GitHub Release：https://github.com/WU-HINS/ds-harness-remote/releases/tag/v1.15.15
- 镜像 tag：`ghcr.io/wu-hins/ds-harness-remote/server` → `1.15.15`、`1.15`、`latest`
- tag 指向提交：`74fac73 feat(account): rotate a device key in place, close D10`

---

# 第九轮（2026-11-11）· M1：拆 store-pg，关闭 D2

## 目标

目标 `goal-44066b0a…` 的第一里程碑：把 `store-pg.ts` 从 770 行降到 ≤650，SQL containment 扩展为
`server/src/store/*`，Store 仍是唯一数据入口与唯一事务边界，行为不变。

## 结构

| 文件 | 行数 | 职责 |
|---|---|---|
| `server/src/store/core.ts` | 40 | `ApiError`、`digest`/`randomToken`/`equal`、scrypt 口令、`UserRow`/`SavedDevice` |
| `server/src/store/device-keys.ts` | 140 | 设备密钥：backfill、唯一设备名、创建/列表/吊销/校验/轮换 |
| `server/src/store/sessions.ts` | 31 | Web 会话：创建/解析/清理/删除 |
| `server/src/store/email-codes.ts` | 70 | 邮件验证码：配额、尝试计数、过期清理 |
| `server/src/store-pg.ts` | **612** | 连接/认证/设备缓存/用户/OIDC/设置/审计，事务仍只在这里 |

契约同步：§3.2 与 §4.2 的 SQL 允许面改为 `schema.ts` / `store-pg.ts` / `store/*`；§4.3 store 预算
799→612；§2 Store 方法 63（57 公开 / 6 私有）；K/S 各行证据路径改到实际模块；D2 → **已关闭**。

## 等价性

- 17 个方法体逐一对比 HEAD：搬移后除 `cache.revokeCached` 钩子、`cleanupEmailCodes→cleanup`、
  `const x; return x?.user` → `return (await …)?.user` 外无逻辑差异；错误码、配额、尝试计数、
  60s sweep、1 天保留、缓存失效顺序全部保持。
- `BEGIN/COMMIT/ROLLBACK` 仍只在 `store-pg.ts`（issue / createUser / createFirstAdmin）；
  `store/*` 零 `pool.connect()`、零事务。
- `ApiError` 单一定义在 `store/core.ts`，由 `store-pg.ts` 重导出，`instanceof` 不受影响。

## SQL containment 判别

`policy.json` 改成 `sqlPrefixes: ["server/src/store/"]`，规则用 `startsWith` 且带尾斜杠：

```
server/src/store/__probe.ts  含 SELECT → ok（0 违规）
server/src/__probe.ts        含 SELECT → ✗ SQL 出现在允许清单之外
```

证明豁免的是目录而不是「任何叫 store 的前缀」；探针已删除，树干净。

## 门禁

```
pnpm verify（59 s）  build ✓ check ✓ guard 11/11 ✓ test ✓
  protocol 94；server 270（store 35 / lifecycle 41 / admission 24 …）
  合计 364 条断言，0 failed
DATABASE_URL=… pnpm test:pg   pg-smoke 9 passed；其余套件全绿
```

## 审核

`reviewer-store2`：**APPROVE**，0 P0 / 0 P1 / 6 P2。逐方法 AST 对比、事务边界、SQL 前缀判别、
预算/方法计数、导入无环均通过。P2 处置：

| P2 | 处置 |
|---|---|
| K7/S2/S3 证据路径仍指 store-pg | 已改为 `store/device-keys.ts` / `store/core.ts` |
| store-pg 导入 `equal`/`verifyPassword*` 但未使用 | 已删本地导入，保留重导出 |
| 删 `lastSweep` 留下双空行 | 已归一 |
| 测试直接改两级私有字段 | 新增 `EmailCodeStore.resetSweep()` 测试缝，测试改调它 |
| 预算 612/612 零余量 | 设计如此，下一次改动先拆 |
| `server/src/store/` 未跟踪 | 提交时 `git add -A` 纳入 |

## 剩余

- M2：`app.ts` 1089 → ≤950，关闭 D1；
- M3：`invariant-coverage` 门禁 + O/M/K 具名用例；
- M4：发布 1.15.16。

---

# 第十轮（2026-11-11）· M2：拆 app.ts，关闭 D1

## 目标

目标 `goal-44066b0a…` 的第二里程碑：`app.ts` 1090→≤950（实际 ≤700），分组路由表 + handler 模块，
路由文档同步仍有效，关闭 D1。

## 结构

| 文件 | 行数 | 职责 |
|---|---|---|
| `server/src/app.ts` | **665** | 创建/生命周期、中间件、setup/login/页面/设备 API；分组路由表 |
| `server/src/routes/admin.ts` | 222 | 后台设置、用户、设备、审计、SMTP 测试 |
| `server/src/routes/auth-flows.ts` | 297 | 自助注册、找回/改密、换绑邮箱、OIDC start/callback/bind/unbind |

分组表只放路径谓词与依赖注入，命中即 return；精确路径仍在各 handler 的 `path ===` / 正则里。
`route-doc-sync` 的扫描面同步扩展为 `app.ts + routes/*.ts`（33 条精确 / 6 家族，与 HEAD 一致）。

## 等价性

- 评审对搬移区做 token 级对比：auth 3248 token、admin 2520 token **完全一致**（仅去掉 `deps.` 前缀）；
  唯一的差异是 admin 的 `METHOD_NOT_FOUND` 从 if 块尾移到函数尾。
- 错误码/状态码/Set-Cookie/redirect 目标/审计动作/分支顺序全部保持；`/auth/login`、`device-login`、
  `logout`、`me`、`setup`、`refresh`、设备 API 均未被分组前缀捕获。
- 未匹配的 admin 路径仍是先 `requireAdmin`（401/403）再 `METHOD_NOT_FOUND`（404），与 HEAD 同序。

## 门禁

```
pnpm verify（57 s）  build ✓ check ✓ guard 11/11 ✓ test ✓
  protocol 94；server 270；合计 364 条断言，0 failed
pnpm test:pg（PostgreSQL 15.19）  pg-smoke 9 passed，其余全绿
Chromium（真库 dsh_browser3）    70/70
全业务走查（真 SMTP + OIDC）     60/60
```

## 审核

`reviewer-m2`：**APPROVE**，0 P0 / 0 P1 / 5 P2。token 级等价、dispatch 捕获、route-doc-sync 三向判别、
预算与导入图均通过。P2 处置：

| P2 | 处置 |
|---|---|
| `docs/README.md` 仍写只扫 app.ts | 已改为 app.ts + routes/*.ts |
| app.ts 遗留 `bindPage` 死导入 | 已删 |
| 分组前缀对两条路由门禁不可见 | 在 `route-doc-sync` 注明不变量：分组 handler 必须保留精确 `path ===` 守卫 |
| app.ts 665/665 零余量 | 设计如此，下一次改动先拆 |
| admin.ts 多缩进一级 | 已整体回退两级 |

## 剩余

- M3：`invariant-coverage` 门禁 + O/M/K 具名用例；
- M4：发布 1.15.16。

---

# 第十一轮（2026-11-11）· M3：invariant-coverage 门禁 + 19 条具名用例

## 目标

目标 `goal-44066b0a…` 的第三里程碑：新增第 12 条 guard，O1–O7 / M1–M5 / K1–K7 每条都有
`[ID]` 具名用例；缺失即红。

## 实现

| 文件 | 内容 |
|---|---|
| `scripts/guard/rules/invariant-coverage.mjs` | 只认 `check/expectReject/it/test` 的第一个**字符串字面量**；字符串感知地剥掉 `//` 与 `/* */`，注释里的 tag 不算 |
| `scripts/guard/policy.json` | `invariants`：19 条 ID → 中文定义，作为唯一清单 |
| `scripts/guard/rules/index.mjs` | 第 12 条规则注册 |
| `server/tests/oidc-invariants.mjs`（新） | 真 fake OP：O1 issuer、O2 state 一次性/过期/nonce、O3 S256/verifier/重放、O4 HMAC 拒绝、O5 azp、O6 userinfo sub 正反、O7 allowedDomains/大小写归一 |
| `server/tests/invariants-smoke.mjs`（新） | K5 未绑定设备、K6 改密/改邮箱不改密钥集合 |
| 既有用例 | M1 404、M2 禁用/删除/自删、M3 唯一且不可推导、M4 预算/队列/匿名限流、M5 真实写路径审计、K1 存活密钥、K2 摘要+密封、K3 吊销、K4 读/铸/吊销、K7 轮换回显 |

根契约：§3.2 由 11 条改为 **12 条**并新增规则行；§6.1 要求 `[O1]`…`[K7]`，缺用例 = P1；
§2/§3 测试套件 12→14；C3 标题 K1–K7；§16 第 6 项标记完成。

## 判别测试（实际执行）

```
移除 [K7] 标签                         → 不变量 K7 没有具名用例（18/19）
在原行尾加 // [K7]                    → 仍然红（注释不算）
改成 /* [K7] */ 块注释                 → 仍然红
policy 增加 O8 但没有用例              → 红（19/20）
恢复                                   → 19/19，guard 12/12 绿
```

## 审核

`reviewer-m3` 首轮 **REJECT**（2×P1）：

1. 规则扫描整文件文本，行尾/块注释与裸字符串都能冒充用例 → 已改为「第一个字符串字面量 + 字符串感知去注释」；
2. `[M5]` 只断言 `Array.isArray`，空审计表也能绿 → 已改为真实写路径：`POST /account/device-keys` 后
   从 `/admin/audit` 找到 `device_key.created`，断言 actor=alice、userId、detail.keyId。

复评 **APPROVE**：P1 全部关闭，10 条 P2 落地；剩余 P2（M4 三层未全标、O3 属 OP 性质、K4 吊销路径、
计数审计）不阻塞，已记录。

## 门禁

```
pnpm verify（56 s）  build ✓ check ✓ guard 12/12 ✓ test ✓
  protocol 94；server 290（store 37 · lifecycle 42 · http 60 · oidc-invariants 14 · invariants 2 …）
  合计 384 条断言，0 failed
pnpm test:pg：pg-smoke 9 passed，其余套件全绿
Chromium 70/70；真 SMTP + OIDC 走查 60/60
```

## 剩余

- M4：版本 1.15.16、三处同步、tag、CI/Release/镜像核对。

---

# 第十二轮（2026-11-11）· M4：发布 1.15.16

## 版本

`package.json` / `server/package.json` / `web/package.json` 三处同步 **1.15.16**；
协议包保持独立语义化 **0.5.21**；`root.ai.md` §2 发布版本同步。

## 交付内容（1.15.15 → 1.15.16）

| 里程碑 | 结果 |
|---|---|
| M1 / D2 | `store-pg.ts` 770→612；`store/{core,device-keys,sessions,email-codes}`；SQL containment 支持 `store/*` |
| M2 / D1 | `app.ts` 1090→665；`routes/admin.ts`、`routes/auth-flows.ts`；分组路由表 |
| M3 | 第 12 条门禁 `invariant-coverage`；O1–O7 / M1–M5 / K1–K7 共 19 条具名用例 |
| D10 | 设备密钥原地轮换 + 遗留密钥出路（前一版已发；本版保持） |

## 最终门禁

```
pnpm verify（56 s）  build ✓ check ✓ guard 12/12 ✓ test ✓
  protocol 9 files / 94 tests
  server 290 条：store 37 · lifecycle 42 · http 60 · admission 24 · oidc-invariants 14 ·
                 invariants 2 · runtime 16 · auth 23 · oidc 18 · account 15 · journey 12
  合计 384 条断言，0 failed
pnpm test:pg（PostgreSQL 15.19）  pg-smoke 9 passed
Chromium（真库）                 70/70
全业务走查（真 SMTP + OIDC）     60/60
```

## 兼容性

- 上游协议帧/错误码/关闭语义未改；`packages/protocol` 未动。
- HTTP 行为由 M2 的 token 级等价复核（[auth 3248 / admin 2520]）+ 全量 HTTP/走查保证。
- 新增的只是门禁与具名用例，不改运行时行为。

## 发布步骤

1. 三处版本同步 → `chore(release): 1.15.16`
2. `git tag v1.15.16` → 推送分支与 tag
3. CI（Check and test / Build image / Store smoke on PostgreSQL）与 Release（Validate tag / Create release / Publish image）
4. 镜像 `ghcr.io/wu-hins/ds-harness-remote/server` → `1.15.16` / `1.15` / `latest`
