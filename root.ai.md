<!-- generated file · do not edit · source: ../root.ai.md (project root) · rebuild: pnpm guard --sync -->
<!-- mirror:begin -->
# ds-harness-remote 工程约束

> **位置**：项目根 `/data/dsh/workspace/ds-harness-remote/root.ai.md`。本文件管辖整个工作区，而不只是 `repo/`。
> **权威**：本文件是唯一可编辑副本。仓库内的 `repo/root.ai.md` 是由本文件生成的镜像（随 git 版本化、供 CI 读取），禁止手改；改完这里运行 `pnpm guard --sync` 重建，漂移会让 `pnpm guard` 变红。
> **生效**：2026-11-10 · 基线：服务端/前端 1.15.14，协议包 0.5.21 · 上游协议：liguobao/ds-harness-remote

## 工作区布局（先认清哪里是「项目」）

| 路径 | 是什么 | 能否作为真源 |
|---|---|---|
| `repo/` | git 检出，唯一源码树（server / web / packages / docs / scripts） | **能**，§1 的 A/C/D 级真源都在这里 |
| 本文件 | 项目级工程约束（§1 的 B 级真源） | **能** |
| `devtools/`、`.review-run/` | 历史调试残留：被复制出去试跑的源码副本 | **不能**，不得引用、不得修改、不得当作证据 |
| `feat-*.patch` 等根目录散落文件 | 历史补丁与草稿 | **不能**，只作考古 |

规则：任何结论都必须在 `repo/` 里可验证。从 `devtools/` 或 `.review-run/` 读到的实现细节一律视为过期副本，按 §14 第 3 条处理。

---

## 0. 一句话定义什么叫"做完"

**做完 = `pnpm verify` 全绿 + 审核团无 P0 + 文档与真源一致 + 变更说明可复现。**

不满足任意一条，改动就是没做完，不允许以"功能已经能跑"申请通过。后面所有条款，都是在把这句话拆成可检查的判据。

---

## 0.1 定位与边界（这个仓库到底是什么）

本仓库是上游 **liguobao/ds-harness-remote** 的**服务端最小面独立实现**：不是上游代码的拷贝，也不是它的分支。上游提供**完整协议**（帧、握手、错误码、关闭语义），本仓库只承接「服务端这一面」，并在协议之上补齐上游没有的账号层。

**三条差异化能力（本仓库存在的理由，也是唯一允许扩张的方向）：**

| # | 能力 | 边界 |
|---|---|---|
| C1 | **完整 OIDC** | 发现文档校验、PKCE S256、state/nonce、azp/aud、算法白名单、域白名单、首登绑定、SSO-only 矩阵 |
| C2 | **多用户体系** | 角色仅 admin/user、租户隔离、每用户配额与连接上限、审计、管理员不可被禁用/删除 |
| C3 | **单用户多密钥** | 一个账号 N 把设备密钥、每把绑定 N 台设备、**所有者可随时回显**、吊销即断连 |

**明确不做：**

- 桌面端、移动端、浏览器扩展、编辑器插件——属于上游或其他仓库的产物。
- 工作区、会话、提示词、工具调用、文件内容的处理：服务端只转发密文，理解载荷 = 破坏 S1。
- 业务集成（DNS、网盘、通知渠道等）。
- 为客户端代劳的重试、缓存、格式化：客户端行为不下沉到服务端。

**新能力准入三问（缺一即拒，结论写进评审文件）：**

1. 它是**上游协议运行所必需**，还是 C1/C2/C3 之一？都不是 → 拒。
2. 它是否需要服务端**理解业务明文**？需要 → 拒（S1）。
3. 它是否引入**新的对外路由家族**？引入 → 先在 `scripts/guard/policy.json` 的 `routeGroups` 登记能力归属并在本节说明，由 `fork-surface` 校验。

## 0.2 与上游的兼容契约

1. 帧、错误码、关闭语义以 `packages/protocol` 为镜像；`fixtures/protocol/v1` 是一致性基线，协议改动必须让 `conformance-fixtures` 用例通过。
2. **不得私有扩展线格式**。扩展走 capability negotiation 且默认关闭；上游客户端不认识的能力必须被安静忽略。
3. 上游客户端「能连、能注册、能中继」是验收底线；被破坏按 **P0** 处理。
4. 允许有上游没有的能力（C1/C2/C3），但**不得改变上游帧语义**：账号层只能加在 HTTP 面上，不能塞进中继帧。

## 1. 真源分级

| 级别 | 文件 | 说了算的范围 | 冲突时 |
|---|---|---|---|
| A | 代码本体（`server/src/app.ts`、`server/src/schema.ts`、`packages/protocol/src/index.ts`、三个 `package.json`） | 实际行为、表结构、帧格式、版本 | 以代码为准，改文档 |
| B | 本文（项目根 `root.ai.md`） | 工程约束、门禁、评审、提交规则、定位与边界 | 以本文为准，改代码 |
| C | `docs/api.md` | 对外 HTTP/WS 契约 | 与 A 冲突时以 A 为准，并且在同一次提交内修正 C |
| D | 其余文档（`docs/configuration.md`、`docs/auth.md`、`docs/operations.md`、`docs/security.md`、`README.md`） | 对 A/C 的展开与解释 | 一律改 D |

规则：

1. **同一事实只允许有一处完整表述**。需要引用时写「见 `root.ai.md` §6」或「见 `docs/api.md` §Device」，不许复制粘贴条文。
2. **数值必须取自真源**：版本号、路由数、错误码数量、行号、表名。禁止「约」「最新」「若干」。
3. **`docs/README.md` 是唯一索引**。新增文档不登记 = 文档不存在。
4. 文档里出现的仓库路径必须真实存在，由 `scripts/guard/rules/doc-path-check.mjs` 强制。
5. **上游协议是一级真源**：与上游帧/错误码冲突的实现，要么改实现，要么先改本文 §0.2 并给出兼容期，不接受「我们就这样」。
6. **本文只有一个可编辑副本**：项目根的 `root.ai.md`。仓库内的 `repo/root.ai.md` 是由本文生成的**镜像**（供版本化与 CI 读取），禁止手改；改完本文运行 `pnpm guard --sync` 重建，漂移会让 `pnpm guard` 变红。

---

## 2. 基线事实（写进任何方案前先核对）

| 项 | 值 | 核对方式 |
|---|---|---|
| 仓库形态 | pnpm workspace：`server`、`web`、`packages/*` | `pnpm-workspace.yaml` |
| 上游 | liguobao/ds-harness-remote（完整协议）；本仓库是其服务端最小面独立实现 | 本文 §0.1 / §0.2 |
| 本仓库独有能力 | C1 OIDC、C2 多用户、C3 单用户多密钥 | 本文 §6.1 |
| 发布版本 | 1.15.15（`package.json`、`server/package.json`、`web/package.json` 三处同步） | `node scripts/guard/index.mjs --only version-lockstep` |
| 协议包版本 | 0.5.21，独立语义化，服务端以 `workspace:*` 依赖 | `packages/protocol/package.json` |
| Node | `engines: >=22`；CI 用 24.9.0；镜像用 `node:22-bookworm-slim` | 三处都不得低于 engines |
| 包管理器 | pnpm 9.15.4（`packageManager` 字段与 CI 一致） | `package.json` |
| 服务端依赖 | `pg`、`ws`、`jose`、`nodemailer`、`zod` | `server/package.json` |
| 测试栈 | `pg-mem` + 手写 `.mjs` 冒烟套件（12 套；`pg-smoke` 需 `DATABASE_URL`）；协议包用 `vitest`（9 套） | `server/scripts/smoke-store.sh` |
| 协议一致性夹具 | `fixtures/protocol/v1`（11 个 JSON/README），由 `conformance-fixtures` 用例逐条校验 | `packages/protocol/tests/conformance-fixtures.test.ts` |
| 测试基建 | `scripts/test-scenarios.mjs`：场景分组执行器，被 5 个协议用例导入 | `packages/protocol/tests/error-codes.test.ts` |
| 数据库 | **仅 PostgreSQL**，声明式 schema，**没有迁移目录** | `server/src/schema.ts` |
| 部署 | 单写者：进程启动即抢 `pg_try_advisory_lock('dsh_single_writer')` | `server/src/store-pg.ts` |
| 中继带宽预算 | 普通账号合计 **5 MiB/s**，按权重分配；权重随账号自身吞吐衰减（占用越多份额越小） | `server/src/relay-budget.ts` |
| 数据表 | `setup_lock`、`users`、`sessions`、`devices`、`device_tokens`、`device_keys`、`email_codes`、`server_settings`、`audit_log` | `server/src/schema.ts` |
| 错误码 | 53 个，集中在 `new ApiError('…')` | `grep -ohE "new ApiError\('[A-Z_]+'" server/src/*.ts` |
| 审计动作 | 34 个，形如 `device_key.created` | `grep -ohE "audit\('[a-z_.]+'" server/src/*.ts` |
| 存储方法 | `Store` 类 63 个方法（57 公开 / 6 私有），是唯一数据入口；域逻辑在 `server/src/store/*` | `server/src/store-pg.ts`（TS AST 计数） |

**禁止**在没有核对上表的情况下断言"我们有 / 我们没有某个能力"。断言前跑命令，把输出贴进提交说明。

---

## 3. 门禁矩阵（唯一合法验收方式）

| 命令 | 覆盖 | 失败意味着 | 必跑时机 |
|---|---|---|---|
| `pnpm build` | protocol → web(esbuild) → server(tsc) | 产物不成立 | 每次提交前 |
| `pnpm -r check` | 三个包的类型检查 | 类型层已破 | 每次提交前 |
| `pnpm guard` | 11 条静态不变量（见 §3.2） | 结构/契约/预算已漂移 | 每次提交前，CI 强制 |
| `pnpm test` | = `pnpm -r test`：server 12 套冒烟（`pg-smoke` 需 `DATABASE_URL`）+ protocol 9 套 vitest | 行为回归 | 每次提交前 |
| `pnpm test:pg` | 同上但打真 PostgreSQL | pg-mem 掩盖了方言差异 | 涉及 SQL、索引、事务、锁时 |
| `node server/scripts/protocol-walkthrough.mjs` | 双端协议走查 | 帧语义与客户端不兼容 | 改动 `packages/protocol/src` 时 |
| `node server/scripts/client-compat-walkthrough.mjs` | 旧客户端兼容 | 老客户端会断 | 改动握手/认证帧时 |
| `pnpm verify` | build + check + guard + test | 一条不过即不过 | 提交前、合并前、发布前 |

### 3.1 硬规则

1. 门禁失败**不允许**提交；`git commit --no-verify` 属于 P0。
2. 用 `test.skip`、`.only`、`todo`、删断言、放宽断言换绿，属于 P0。测试是契约，不是装饰。
3. 门禁通过**不等于**功能正确。它只证明"已知不变量没被破坏"。功能正确性必须另有可复现的手工或自动化证据。
4. 涉及数据库的改动，绿了的 `pnpm test` 不算数：必须在 `pnpm test:pg` 下重跑，因为 `pg-smoke` 在无 `DATABASE_URL` 时会被跳过。
5. 每次提交必须贴出门禁输出摘要（命令 + 结果 + 耗时）。贴不出来 = 没跑。
6. 新增一条 guard 规则的 PR 必须先证明它在违规输入下会失败（注入一条假违规，看它变红，再撤回）。只会变绿的检查器等于没有检查器。

### 3.2 `pnpm guard` 的 11 条不变量

| 规则 | 断言 |
|---|---|
| `file-budget` | 文件行数不超预算；超过 600 行必须登记预算（只降不升） |
| `sql-containment` | SQL 只出现在 `schema.ts`、`store-pg.ts` 与 `store/*` 领域模块（唯一豁免：就绪探针 `SELECT 1`） |
| `console-containment` | `console.*` 只允许出现在 `logger.ts`、`main.ts`、`config.ts` |
| `schema-idempotence` | 声明式 schema 每条语句重跑都无副作用；禁止 `DROP` |
| `route-doc-sync` | `app.ts` 里每条 `/api/v1` 路由与 `:id` 家族都必须在 `docs/api.md` 出现；文档也不许写代码里没有的路由 |
| `doc-path-check` | 文档引用的仓库路径必须存在 |
| `test-wiring` | 根 `test` 覆盖全部 workspace；每个用例文件都被某个 runner 执行；测试里的相对导入必须可解析；workspace 登记完整 |
| `version-lockstep` | 三处发布版本一致；协议包独立版本；依赖必须是 `workspace:*` |
| `secret-scan` | 源码与文档不得出现真实凭据（私钥、AKIA、ghp_、Slack、字面 JWT） |
| `root-mirror` | 仓库内的 `root.ai.md` 必须是项目根版本的逐字镜像（由 `--sync` 生成，不允许手改） |
| `fork-surface` | 每条 `/api` 路由必须落在已登记的能力家族内；新家族不登记即失败（§0.1 准入三问的机器化） |

阈值与豁免**只允许**在 `scripts/guard/policy.json` 里改。改阈值是评审事项，不是实现细节；豁免必须带 `reason`，并且要能在债务登记（§15）里找到对应条目。

---

## 4. 分层与依赖方向

### 4.1 允许的依赖

`web` →（HTTP/WS）→ `server` → { `store-pg` → PostgreSQL，`gateway` → WS 连接，`runtime` → `server_settings` }
`server` 与 `web` → `@dsh-remote/protocol`（只共享帧类型与错误码）

### 4.2 禁令与执行手段

| 禁令 | 为什么 | 谁在管 |
|---|---|---|
| `packages/protocol` 不得 import `server` 或 `web` | 协议包要能独立发版给第三方客户端 | 代码评审 + `pnpm -r check` |
| 除 `app.ts` 之外不得分发路由 | 路由表只有一处，才能被 `route-doc-sync` 校验 | guard |
| 除 `store-pg.ts` / `schema.ts` / `store/*` 之外不得出现 SQL | 连接池、事务、注入面只有 Store 一个出口 | guard |
| 除 `logger.ts` 之外不得直接写 stdout | 日志格式与脱敏不能有第二个实现 | guard |
| `pages.ts` 只允许返回 HTML 字符串，不得访问数据库或网络 | 它是渲染层，混入 IO 就无法在无库环境下测试 | 评审 |
| `runtime.ts` 是运行时配置的唯一入口 | 配置来源 env + `server_settings('runtime_config')`，双源并存必然漂移 | 评审 |
| `gateway.ts` 不写库、不发邮件 | 连接层出故障时不得拖垮写入路径 | 评审 |
| 新增外部依赖必须说明：用途、体积、许可证、被替代方案 | 供应链即攻击面 | 评审 + P1 |
| 禁止引入前端框架/构建链 | 当前前端是原生 ESM + esbuild，产物体积与 CSP 都依赖这一点 | 评审 |

### 4.3 文件预算（棘轮机制）

| 文件 | 预算（行） |
|---|---|
| `server/src/app.ts` | 1089（1090→1089：新增轮换路由后压缩注释，零余量） |
| `server/src/store-pg.ts` | 612（799→612：设备密钥 / 会话 / 邮件验证码拆到 `store/*`，Store 保留门面） |
| `server/src/gateway.ts` | 621（733→621：抽出 `gateway-admission.ts`，D11 已关闭） |
| `packages/protocol/src/index.ts` | 1473 |

规则：

1. 预算**只降不升**。任何文件加行超过预算，guard 直接失败。
2. 需要加行时只有两条路：把逻辑拆到新文件，或者先扩预算——扩预算必须在提交说明里写清「为什么拆不动 + 拆分计划 + 截止版本」，并作为 P2 记入债务。
3. ≥600 行的新文件必须立刻登记预算，不允许存在"未登记的巨型文件"。
4. `node scripts/guard/index.mjs --update` 会按当前状态重设基线，**只允许在拆分后的提交里使用**，且必须在描述中写「budget: -N 行，拆分方式 X」。
5. 行数以 guard 的 `readLines()` 计：`readFileSync(...).split('\n').length`，**含末尾空行**，等于 `wc -l` + 1。文档与评审引用行数时必须用同一口径。

---

## 5. 数据层

1. **声明式，无迁移**。新增列用 `ALTER TABLE … ADD COLUMN IF NOT EXISTS` 追加到 `SCHEMA_STATEMENTS`，必须能在旧库、空库、半应用库三种状态上收敛。
2. **禁止 `DROP` / `TRUNCATE` / 破坏性 `ALTER`**。需要删列时：先停止写入，发一个版本只读，再下一个大版本删除，并在发布说明里给出 `pg_dump` 指引。
3. **索引名稳定**（`IF NOT EXISTS` 依赖名字）。改索引语义 = 换名字，不要原地改定义。
4. **唯一索引与归一顺序**：先 `SCHEMA_NORMALISE`，再建唯一索引；否则旧库会因大小写重复而启动失败。
5. **时间列一律 `timestamptz`**，默认 `now()`；半结构化数据用 `jsonb`，不要塞逗号分隔字符串。
6. **事务边界在 `Store` 内**。跨表写必须单事务；路由层不得直接持有连接或事务。
7. **凭据存储分层**：密码 `scrypt`；会话/设备令牌只存 SHA-256 摘要；验证码存 HMAC；**设备密钥 = 摘要（查找）+ AES-256-GCM 加密副本**（见 §6.1 K2，数据库备份等同凭据）。除设备密钥这一已登记取舍外，数据库里出现可逆凭据即 P0。
8. 破坏性 schema 变更必须在发布说明中单列一节，注明「需要备份」「需要停机」「回滚方式」。

---

## 6. 安全不变量（违反任一条 = P0，直接阻断）

| # | 不变量 | 现状依据 |
|---|---|---|
| S1 | 服务端永远看不到明文业务流量；中继帧不落库、不进日志 | `docs/security.md` |
| S2 | 口令用 `scrypt` + 每用户盐；会话/设备令牌只存摘要（设备密钥按 S3：摘要 + 加密副本） | `server/src/store/core.ts` |
| S3 | 凭据存储分层：**会话/设备令牌 = 仅摘要**；**验证码 = HMAC 摘要**；**设备密钥 = 摘要（查找）+ AES-256-GCM 加密副本（所有者可再次查看）**。因此「拿到数据库 + 进程密钥即可还原设备密钥」是**已知取舍**，必须写进威胁模型，不得宣称「只存摘要」 | `server/src/store/core.ts`、`server/src/store/device-keys.ts`、`server/src/secret-box.ts`、`docs/auth.md` |
| S4 | 跨租户一律 **404**，不返回 403，避免存在性泄漏 | `docs/api.md` §Device |
| S5 | 会话 Cookie：`HttpOnly; SameSite=Lax; Secure（https 时）` | `server/src/app.ts` 的 `cookie()` |
| S6 | 状态变更请求校验 `Origin` / `Sec-Fetch-Site`；OIDC 回调是唯一豁免，靠 state cookie | `docs/security.md` |
| S7 | 匿名端点必须限流；限流桶在进程内，因此**单写者**是安全前提，不是性能选择 | `server/src/ratelimit.ts` |
| S8 | `CSP: script-src 'self' 'sha256-…'`，禁止内联脚本；`style-src 'unsafe-inline'` 是已登记的例外 | `server/src/app.ts` |
| S9 | setup key 一次性；管理员创建后初始化端点永久关闭 | `server/src/app.ts` |
| S10 | `SSO-only` 不得把所有人锁死：设备凭据与 `DSH_BREAK_GLASS_PASSWORD` 必须保留逃生路径 | `docs/auth.md` |
| S11 | 日志脱敏是双保险：按 key 命中 + 按值模式命中，任何新增敏感字段必须落到 `SENSITIVE_KEYS` 或等价规则 | `server/src/logger.ts` |

新增任一端点前，必须先在评审里回答五个问题：

1. 谁能调用（匿名 / 会话 / 设备令牌 / 管理员）？
2. 越权时返回什么？为什么不是 403？
3. 是否限流？桶的 key 是什么（用户 / IP）？
4. 写操作是否产生审计？动作名是什么（必须能在 §2 的 33 个里找到或新增并登记）？
5. 失败路径会不会把异常吞成"成功"或"空列表"？

答不全不允许写代码。

---

### 6.1 三条差异化能力的不变量（C1 / C2 / C3）

违反任一条 = **P0**；每条都必须有对应用例，缺用例 = P1。

**C1 · OIDC（O1–O7）**

| # | 不变量 | 现状依据 |
|---|---|---|
| O1 | 发现文档的 `issuer` 必须与配置逐字一致（仅容忍尾斜杠），否则 `OIDC_ISSUER_MISMATCH` | `server/src/oidc.ts` |
| O2 | `state` 一次性、600s 过期；`nonce` 必须与本次会话逐字相等 | 同上 |
| O3 | 强制 PKCE S256；授权码只兑换一次，重放必然失败 | 同上 |
| O4 | `id_token` 校验 `iss`/`aud`/`exp`（容忍 60s 漂移），算法白名单 RS/PS/ES，**禁止 none 与 HMAC** | 同上 |
| O5 | 多 audience 或存在 `azp` 时，`azp` 必须等于 client_id | 同上 |
| O6 | 用 userinfo 兜底取 email 时必须校验 `sub` 一致；失败不得放宽为「没有邮箱也能进」 | 同上 |
| O7 | `allowedDomains` 非空时强制；email 一律小写归一；SSO-only 下密码登录/重置/换绑全部关闭，但设备密钥仍可登录 | `server/src/app.ts`、`docs/auth.md` |

**C2 · 多用户（M1–M5）**

| # | 不变量 | 现状依据 |
|---|---|---|
| M1 | 跨租户一律 404；设备、presence、中继、密钥、审计都按 `user_id` 过滤 | `server/src/app.ts` |
| M2 | 角色只有 `admin`/`user`；管理员不可被禁用/删除（`ADMIN_PROTECTED` 409）、不可删自己（`CANNOT_DELETE_SELF`） | `server/tests/http-smoke.mjs` |
| M3 | 虚拟设备用户名 `dev-xxxxxxxx` 唯一且随机；不得由用户名/邮箱推导 | `server/src/store/device-keys.ts` |
| M4 | 三层限流：每用户请求/分钟、每用户并发连接上限、每 IP 匿名限流；外加**普通账号共享 5 MiB/s 中继带宽，按权重分配**：`weight = 1/(1+rate/B)`，`share = B·w/Σw`，份额之和恒等于 B。**超出份额先入队**（每设备 FIFO，32 帧 / 256 KiB 上限，最长等待 15s），队列空转即断开；**禁止丢帧**（中继帧带严格 counter，缺口会被对端判为协议违规）。单写者前提不得破坏 | `server/src/ratelimit.ts`、`server/src/gateway.ts`、`server/src/gateway-admission.ts`、`server/src/relay-budget.ts`、`server/src/relay-queue.ts` |
| M5 | 所有写操作必须落审计，动作名在 §2 的 34 个白名单内，且带 actor 与目标 | `server/src/store-pg.ts` |

**C3 · 单用户多密钥（K1–K6）**

| # | 不变量 | 现状依据 |
|---|---|---|
| K1 | 一个用户 N 把密钥，每把可绑定 N 台设备（`devices.device_key_id`）；换绑不删除密钥 | `server/src/store/device-keys.ts` |
| K2 | 库内 = 摘要（登录查找）+ AES-256-GCM 加密副本；**所有者必须能回显**：同一明文逐字节一致，接口返回 `key` 且 `revealable: true`。加密密钥由 `server_settings.code_secret` 经 HKDF 派生，**数据库备份等同凭据** | `server/src/store/device-keys.ts`、`server/src/secret-box.ts`、`docs/api.md` |
| K3 | 已吊销密钥：不可查看明文、不可登录；吊销同时吊销其名下设备并删除 `device_tokens`（立即断连） | `server/src/store/device-keys.ts` |
| K4 | 管理员**永远**不可读取、铸造或吊销他人的密钥；该接口已移除，且有用例断言返回 404 | `server/tests/e2e-lifecycle.mjs` |
| K5 | 未绑定密钥的历史设备必须显示为「(未绑定密钥)」，不得隐藏，也不得计入某把密钥 | `server/src/store/device-keys.ts` |
| K6 | 改密码/改邮箱不得静默改变密钥集合；密钥增删必须有 `device_key.created` / `device_key.revoked` 审计 | `server/src/app.ts` |
| K7 | **回显契约**：未吊销密钥必须 `revealable: true` 且带 `key`；已吊销或历史无密封副本的密钥必须 `revealable: false` 且不带 `key`，界面显式说明并给出「轮换」入口（D10），**不得静默留空**。任何新增密钥的代码路径不得造出无法回显的活密钥（唯一例外：迁移遗留，必须标记） | `server/src/store/device-keys.ts`、`web/src/pages/keys.js` |

## 7. API 契约

1. 成功响应直接返回资源；失败统一为：

   `{ "error": { "code": "RATE_LIMITED", "message": "…", "requestId": "uuid", "retryable": true } }`

2. **错误码是封闭集合**（当前 53 个）。新增错误码必须在同一次提交里更新 `docs/api.md` 与本文 §7 的清单。
3. 路由前缀固定 `/api/v1`；探测端点（`/healthz`、`/ready`）不带前缀。
4. `:id` 家族在文档里写成 `:id`，不写具体 UUID。
5. **兼容性即承诺**：已发布的端点改名、改返回结构、改语义 = P1。要废弃必须先加兼容期，并在 `docs/api.md` 与发布说明双处公告。
6. 遗留 OAuth 探测端点（`/api/v1/auth/oauth/providers` 等）只允许返回固定「未配置」负载，不得接入真实凭据流。
7. 文档里写了一条代码里不存在的端点 = P1（历史上发生过两次，见 `ai-censorship/lead_review-20261110.md`）。

---

## 8. 日志

1. **单行 JSON**，字段稳定，最低包含 `level`、`event`（或 `message`）、`time`；上下文放 `meta`。
2. 只允许用 `server/src/logger.ts` 的导出。新增 `console.*` 会让 `console-containment` 变红。
3. 脱敏：key 命中（`SENSITIVE_KEYS`）+ 值模式（URL 参数、JSON 字段、Bearer/Basic）。新增字段名若是 `*Token`、`*Secret`、`*Pass*`，必须在同一个 PR 里验证它被替换成 `[REDACTED]`。
4. **禁止**打印：密文、SDP、ICE 凭据、验证码、邮件正文、任何 `Authorization` 原值。
5. **禁止日志刷屏**：重试、轮询、冲突重排路径必须限流（首次 + 每 N 次 + 累计计数）。历史教训：单点刷屏曾达到约 3,200 行/秒，22 秒 12 MB。刷屏按 P1 上报，不接受"日志级别可调"作为解释。
6. 异常必须带上下文：哪个设备、哪个连接、哪个动作、耗时。只有 `catch {}` 的空壳属于 P0。

---

## 9. 前端

1. `web/src` 是原生 ESM + `web/build.mjs`（esbuild）单入口 `app.js`，产物带内容哈希进 `web/dist/manifest.json`，服务端只做静态托管。
2. 禁止引入 UI 框架、CSS 预处理器、额外构建步骤。样式写在 `web/src/app.css`。
3. 禁止内联脚本（CSP 只放行带哈希的主题引导脚本）。新增内联脚本 = 需要改 CSP = 评审事项。
4. 页面必须能在 320px 宽度下不重叠、不横向滚动；表格区域必须键盘可达。
5. 错误提示必须是人能读的中文，且区分「表单级」与「字段级」；不允许把 JSON 直接甩给用户。
6. `server/src/pages.ts` 保留服务端渲染的登录/初始化/绑定页；新增页面优先放 `web/src/pages`。

---

## 10. 测试

1. **写了就要有人跑**：每个 `server/tests/*.mjs` 必须出现在 `server/scripts/smoke-store.sh`，每个 `packages/protocol/tests/*.test.ts` 必须被 vitest 收集。guard 的 `test-wiring` 会检查。
2. **认证、权限、限流类改动，至少 1 条否定用例**：越权访问、过期令牌、重放、类型错误、缺字段。
3. **禁止 mock 掉被测对象本身**（用 pg-mem 替真库可以，用假 Store 替真 Store 去测 Store 不可以）。
4. **断言只增不减**。删除或弱化断言必须在提交说明里写「删了哪条、为什么它不是契约」。
5. 涉及 SQL 的改动必须能在 `pnpm test:pg` 下复跑；只跑 pg-mem 报绿属于证据不足。
6. 新增测试要能单独失败：把实现改坏，测试必须变红，否则它是同义反复。
7. **删除测试基建等同删除测试**：harness、fixture、场景执行器被移动或删除时，必须在同一提交里说明并保证用例仍能加载。`test-wiring` 会解析每个用例的相对导入，指向不存在的模块即失败——历史上正是这条缺口让 5 套协议用例静默失效。

---

## 11. 文档

1. 改 API → 同一提交更新 `docs/api.md`。改 schema / 配置 / 部署 → 同一提交更新对应文档。
2. 纯文档提交用 `docs:` 类型，正文写「改了哪几份、依据是什么」。
3. 不得虚构：包名、SDK、CLI、文件路径、配置项必须能在 HEAD 上验证。写错许可证、把未实现功能写成已实现 = P0（对外承诺与事实不符）。
4. 归档文档不删除，但必须在 `docs/README.md` 登记并注明"以哪份为准"。
5. 文档正确性**不能**用「门禁通过」证明；只能靠 `doc-path-check` + 人工比对 + 命令输出。

---

## 12. 代码审核团（压力的落点）

1. **每次提交前必须产出评审文件**：`ai-censorship/[执行体名]_review-YYYYMMDD.md`，包含：变更摘要、逐条不变量核对（§5/§6/§7/§8）、门禁输出、发现的问题与级别、遗留债务。
2. **分级**：

   | 级别 | 定义 | 处置 |
   |---|---|---|
   | P0 | 凭据泄漏、越权、数据损坏、测试造假、跳过门禁、对外承诺造假 | 阻断合并，回滚，24 小时内出复盘 |
   | P1 | 契约漂移（路由/字段/错误码）、文档与实现不一致、日志刷屏、门禁缺口、依赖无说明 | 当次提交内修复，不允许带入下一版 |
   | P2 | 结构问题、行数膨胀、命名、可读性 | 登记债务，给出退出条件 |

3. **证据要求**：每条结论必须带 `file:line` + 复现命令。没有证据的判断视为无效，审核团要为误判负责。
4. **三振机制**：同一执行体连续 3 轮出现 P0，或被证明「用改测试的方式换绿」，评审团应上报并建议撤销其合并权；同一执行体连续 2 轮 P0 自动冻结 24 小时。
5. **中立性**：审核团不得因为"作者已经改了很多"而放行 P0；也不得因为"这不是我写的"而提高标准。
6. 审核团自身连续 2 次误判（把 P0 判成 P2，或把合规判成违规）应当更换执行体。

---

## 13. 提交与发布

1. 提交格式：

   `type(scope): 主题`（50 字内，动词开头，不加句号）
   空行
   `详细描述：` 后接缩进段落：`部分关键变更：…` / `修复问题：…` / `新增功能：…` / `优化：…` / `门禁：…`

2. 一次提交只做一件事。净增 >400 行必须在描述里写结构说明（新文件职责、为什么不能拆更小）。
3. **禁止擅自 push**。推送需要明确授权；打 tag 与发布属于更大权限。
4. 版本发布：三处 `package.json` 同步 → 更新发布说明 → `git tag vX.Y.Z` → 触发 release workflow → 核对产物。
5. 分支命名 `feat/*`、`fix/*`、`chore/*`；主干保护开启，CI 未绿不允许合并。

---

## 14. 一票否决清单

以下行为一经确认，当次提交作废，并记 P0：

1. 改测试、删断言、加 `skip` 让门禁变绿。
2. 绕过门禁（`--no-verify`、手改 `policy.json` 阈值、注释掉 guard 步骤）。
3. 把源码复制到仓库外（`devtools/`、`.review-run/` 之类）试跑，然后声称"已验证"。
4. 在 `docs` 或 `README.md` 写未实现的端点、依赖、能力。
5. `catch {}` 吞异常，把失败降级成成功或空列表。
6. 把凭据、密文、验证码写进日志、审计 `detail` 或错误消息。
7. 新增巨型文件不登记预算，或反复用小改动顶破预算而不拆分。
8. 未说明用途就引入新依赖。
9. 用"日志级别可调"解释刷屏，或用"以后再说"推迟 P1。

---

## 15. 债务登记

| # | 债务 | 级别 | 退出条件 |
|---|---|---|---|
| D1 | `server/src/app.ts` 1090 行：路由分发、handler、页面装配混在一处 | P2 | 拆出路由表与 handler 模块，降到 700 行以内 |
| D2 | `server/src/store-pg.ts` 770 行：连接、认证、设备、审计、设置混在一个类 | 已关闭 | 已拆出 `store/core.ts`、`store/device-keys.ts`、`store/sessions.ts`、`store/email-codes.ts`；`store-pg.ts` 770→612，Store 仍是唯一事务与数据入口 |
| D3 | `server/src/gateway.ts` 621 行：连接状态机与链路转发仍在同一类 | P2 | 拆出连接状态机（帧窗口/带宽/队列已随 D11 抽出） |
| D4 | `packages/protocol/src/index.ts` 1473 行 | P2 | 按帧类型拆文件，导出面不变 |
| D5 | `app.ts` 里仍有 1 处 `console.warn`（route_not_found 兜底） | P2 | 接入 `logger.ts` 后删除该豁免 |
| D6 | CSP 的 `style-src 'unsafe-inline'` | P2 | 样式外置或 nonce 化后收紧 |
| D7 | 管理端设备密钥端点曾在文档中承诺但代码未实现（已修文档） | 已关闭 | 若确需该能力，先写代码，再写文档 |
| D8 | `docs/security.md` 曾写「设备密钥只存摘要、明文只显示一次」，与实现（加密副本、可再次查看）相反 | 已关闭（P0） | 已按 K2 改写；改该段必须同步 §6.1 |
| D9 | 上游协议基线曾未钉版本号，仅有 `fixtures/protocol/v1` 作证 | 已关闭 | `fixtures/protocol/v1/manifest.json` 已记录上游提交 `14037e78f45e14f7a5ad56c2266944548def7e3d`（协议包 0.5.21），README 记录来源与核对方式 |
| D10 | 迁移遗留密钥（无密封副本）曾只能标记为不可回显 | 已关闭 | 已暴露 `POST /api/v1/account/device-keys/:id/rotate`（原地换密、保留绑定、审计 `device_key.rotated`），界面提供「轮换」；store / HTTP / 浏览器三层断言 |
| D11 | `gateway.ts` HEAD 677 → 733（未提交中间态）→ 621 | 已关闭（P1） | 已抽出 `server/src/gateway-admission.ts`（帧窗口、掉线链路墓碑、加权带宽、发送队列），`gateway.ts` 733→621、预算 621；回归 `server/tests/admission-smoke.mjs`（24 条断言）。 |

---

## 16. 待办

1. 把 `app.ts` 的路由分发抽成数据表（路径 → 处理器），让 `route-doc-sync` 可以直接从表生成文档骨架。
2. 为 `server/tests` 增加覆盖门禁：任一不变量（S1–S11）没有对应用例时报警。
3. 用真实设备跑一遍 `server/scripts/browser-check.mjs` 并纳入 CI 的定时任务。
4. 评估把 `pg-mem` 冒烟与真库冒烟的差异用例单列，减少「本地绿、线上红」。
5. 把 §12 的评审文件纳入 CI 检查：提交涉及 §6 任一文件却没有新增评审文件时失败。
6. 把 C1/C2/C3 的不变量逐条落到具名用例（O1–O7、M1–M5、K1–K6），由 `test-wiring` 反查缺失项。
