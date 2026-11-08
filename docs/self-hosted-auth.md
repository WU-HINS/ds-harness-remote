
# 自部署服务端 · 账户与认证需求梳理

状态：已实现（P1–P4）。范围：apps/server 多用户版。
验证：apps/server/scripts/smoke-store.sh，8 套 158 项断言。

## 1. 身份模型（三层，互不复用凭据）

| 层 | 标识 | 凭据 | 用途 |
|---|---|---|---|
| 网页账号 | 邮箱（唯一） | 密码 + 邮箱验证码 | 登录后台、管理自己的资料 |
| 设备 | 虚拟设备用户名 dev-xxxxxxxx | 设备密钥（可多把）或登录密码 | 注册设备、建立远控通道 |
| 联邦身份 | OIDC issuer + sub | IdP 令牌 | 登录网页账号 |

约束：
- 邮箱即用户名；登录框接受邮箱。
- 管理员创建的账号免邮箱验证（verified=true）；自助注册必须验证。
- 一个用户最多绑定一个 OIDC 身份（issuer+sub 唯一）。

## 2. 数据模型变更

users 增列：
- email text unique（登录标识）
- email_verified boolean default false
- password_hash（可为空，纯 OIDC 账户）
- oidc_issuer / oidc_subject（已有）
- 保留 username 作为显示名，默认取邮箱前缀

新增表：
- email_codes(id, user_id, email, purpose, code_hash, expires_at, attempts, consumed_at)
  purpose: register | reset | bind_old | bind_new | change_old | change_new
- oidc_pending(id, state, nonce, verifier, claims jsonb, expires_at)
  用于"未绑定 sub 先认证、后选择绑定/注册"
- server_settings 增键：smtp、ui.backgroundUrl

device_keys 不变；devices.device_key_id 允许 NULL（历史设备与"密码直连"设备）。

## 3. 流程

### 3.1 自助注册
邮箱 → 发验证码（purpose=register）→ 提交 邮箱+验证码+密码
→ 建立 users(email, email_verified=true, role=user) + 初始设备密钥
→ 直接登录（种会话）。

### 3.2 密码登录
邮箱+密码。仅当 email_verified=true。
onlySso 开启时返回 403 SSO_ONLY（除 break-glass）。

### 3.3 找回密码
邮箱 → 发验证码（reset，10 分钟，单次）
→ 提交 验证码+新密码 → 改密并踢掉该用户全部会话。
onlySso 开启时该入口禁用（403）。

### 3.4 用户后台自助
- 改密码：需旧密码（onlySso 下禁用该入口，提示走 IdP）。
- 换绑邮箱：向旧邮箱发 change_old、向新邮箱发 change_new，两个验证码都正确才提交；
  换绑成功后 email_verified 重置为 true（双验证视为已验证），并踢掉旧会话。
- 绑定/解绑 OIDC：显示当前 issuer+sub 摘要；未绑定时可发起绑定（需重新走一次 OIDC 登录）。
  onlySso 开启时禁止解绑（否则无从登录）。

### 3.5 OIDC 首次登录（按邮箱分流）

前提：IdP 必须返回 email，且 email_verified=true；否则拒绝并提示（不静默建号）。

分支 A —— 邮箱未注册：**直接注册并绑定**，建会话。
自动开通受后台 oidc.autoProvision 控制；关闭时提示"请联系管理员开通"。

分支 B —— 邮箱已注册但未绑定 OIDC：
- 后台开关 oidc.bindRequireVerification = false：直接绑定（信任 IdP 已验证邮箱），记审计。
- 开关 = true（默认）：进入选择页（15 分钟有效），二选一校验后绑定：
  - 邮箱 + 密码；
  - 邮箱 + 邮箱验证码。
  仅允许"尚未绑定任何 OIDC"的账户；已绑定其他 sub 的账户直接 409 拒绝。

分支 C —— 邮箱已注册且已绑定同一 sub：直接建会话。
分支 D —— 邮箱已注册但绑定了另一个 sub：409，不覆盖绑定。

onlySso 影响：开启时分支 B 的"密码"选项不可用，只能用邮箱验证码；
已登录用户在后台绑定（3.4）仍可用密码确认。

### 3.6 设备登录
- onlySso 关闭：设备用户名+设备密钥  或  邮箱+登录密码（视为"用密码当设备密码"）。
- onlySso 开启：仅设备用户名+设备密钥。
设备通过密码注册时 device_key_id 为 NULL，后台密钥表显示为"(未绑定密钥)"并单列计数。

## 4. 权限矩阵

| 场景 | onlySso 关 | onlySso 开 |
|---|---|---|
| 网页密码登录 | 允许 | 403（break-glass 例外） |
| 邮箱验证码找回密码 | 允许 | 禁用 |
| 后台用旧密码改密 | 允许 | 禁用 |
| 设备用登录密码 | 允许 | 拒绝 |
| 设备用设备密钥 | 允许 | 允许 |
| OIDC 登录 | 允许 | 允许 |
| OIDC 首登自动注册（邮箱未注册） | 允许 | 允许 |
| 绑定已有账户需验证（开关） | 默认开 | 默认开，但只能用验证码 |
| 解绑 OIDC | 允许 | **禁止** |

## 5. OIDC 技术要求

- 发现：GET {issuer}/.well-known/openid-configuration，缓存 1 小时；校验 issuer 与配置一致。
- 密钥：JWKS 支持 RSA(RS256/PS256) 与 EC(ES256/ES384)；按 kid 选键，未命中强制刷新一次；
  拒绝 none 与 HS*；校验 iss/aud/exp/nonce，时钟容差 60s。
- 客户端认证：client_secret_basic 与 client_secret_post 都支持。
- PKCE：S256 必选；state 绑定浏览器 cookie（HttpOnly, SameSite=Lax, 10 分钟）。
- 额外校验：azp（多 aud 时）、email_verified（若用于绑定邮箱）。

## 6. SMTP 与验证码

配置项（后台可填写，落 server_settings.smtp）：host, port, secure(STARTTLS/SSL), user, pass, from, replyTo。
- 发送失败：注册/找回返回 503，并记录审计；不静默成功。
- 验证码：6 位数字，10 分钟有效，单次使用，最多 5 次尝试；同邮箱 60s 冷却、每小时 5 封、每日 20 封。
- 存储只存 sha256(code + email + purpose)，比较恒定时间。
- 邮件正文不含任何令牌或密码。

## 7. 后台设置新增

- ui.backgroundUrl：必须 https 开头；默认 https://t.hinswu.top/pixiv；登录页与后台作为 CSS background-image 使用。
  外链图片由浏览器直连，服务端不代理；若为空则回退纯色。
- smtp.*：如上；提供"发送测试邮件"按钮。
- oidc.*：沿用现有字段，增加 clientAuthMethod(basic|post)、autoProvision（邮箱未注册时自动建号）、
  bindRequireVerification（邮箱已注册时绑定是否需要二次校验，默认 true）。

## 8. 安全与限流

- 未登录端点：按 IP 30/min；按邮箱 5/min（验证码发送）。
- 登录失败：按邮箱 10/10min，触发后返回 429 并记录审计。
- 会话：HttpOnly + SameSite=Lax + Secure(https)，8 小时；改密/换绑/禁用后全部失效。
- 审计：register / login.failure / email.changed / password.reset / oidc.bind / oidc.unbind / smtp.failure。

## 9. 迁移

- 现有用户 username 不回填邮箱：email 为 NULL 时视为"仅用户名账户"，仍可密码登录；
  首次绑定/换绑邮箱时补 email 并置 verified。
- 管理员账号（首个）不强制邮箱，避免初始化被 SMTP 阻塞。
- 设备密钥与 device_username 不变。

## 10. 分阶段实施

P1 基础：用户表加 email/email_verified；注册+找回+改密+验证码表；SMTP 配置与发送。
P2 OIDC 增强：RS/EC 算法白名单、client auth 两种模式、未绑定 sub 的选择页、后台绑定/解绑。
P3 细节：背景图设置、邮箱双验证换绑、onlySso 全矩阵、审计与限流。
P4 验证：扩展 e2e 到注册→验证码→登录→绑定→换绑→找回 全链路（用本地假 SMTP 与假 IdP）。

## 11. 已定默认（如无异议按此实现）

1. 邮箱即用户名，登录框接受邮箱；显示名默认邮箱前缀。
2. 验证码 6 位 / 10 分钟 / 单次 / 5 次尝试。
3. 管理员建号免验证；首个管理员初始化不要求邮箱。
4. 换绑邮箱必须双验证码。
5. OIDC 首登：邮箱未注册直接建号绑定；邮箱已注册按 bindRequireVerification 决定是否二次校验。
6. onlySso 下"绑定已有账户"只接受邮箱验证码；后台绑定可用密码（已登录态）；禁止解绑。
7. IdP 未返回 email 或 email_verified=false 时拒绝，不建号。
6. 设备用密码注册时 device_key_id 为空，界面单列显示。
7. 背景图仅接受 https URL，默认 https://t.hinswu.top/pixiv。



## 12. 实现状态

| 需求 | 状态 | 入口 |
|---|---|---|
| 邮箱注册 / 验证码 | 已实现 | POST /auth/register/start|complete |
| 找回密码 | 已实现 | POST /auth/password/reset/start|complete |
| 自助改密（旧密码） | 已实现，onlySso 下 403 | POST /auth/password/change |
| 换绑邮箱（新旧双验证） | 已实现 | POST /auth/email/change/start|complete |
| OIDC 发现 + RSA/EC | 已实现（RS/PS/ES 全族，拒绝 none/HS*） | src/oidc.ts |
| 首登 A–D | 已实现 | /auth/oidc/callback |
| 绑定 / 解绑 | 已实现（后台绑定、onlySso 禁解绑） | /auth/oidc/bind, /auth/oidc/unbind |
| 设备密码（onlySso 关） | 已实现 | POST /auth/device-login |
| 背景图 | 已实现（https 强制，默认 pixiv） | /admin 外观 |
| SMTP 配置 + 测试信 | 已实现 | /admin SMTP |

已知取舍：onlySso 关闭时登录密码可作为设备凭据，这会把"密码泄露"放大为"可注册新设备"；
其登记的设备 device_key_id 为空，在密钥面板单列为"(未绑定密钥)"。
