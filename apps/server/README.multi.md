# 多用户 Server

单进程 + PostgreSQL 的多用户版本，替换原来的单账号文件存储。

## 形态

| 能力 | 说明 |
|---|---|
| 初始化 | 首个管理员通过 `/setup` 创建；创建后该路由关闭 |
| Web 登录 | 用户名 + 密码，或 OIDC（可同时开启） |
| 设备登录 | 每个用户一把随机 `deviceKey`，只能换设备令牌，**不能登录 Web** |
| 用户管理 | `/admin` 页面 + `/api/v1/admin/users` API |
| 限速 | 非管理员按用户令牌桶限速；匿名端点按 IP 限速 |
| 数据 | 全部落 PostgreSQL；设备与会话令牌只存 sha256 摘要 |

## 两套身份

| 身份 | 凭据 | 能做什么 |
|---|---|---|
| 网页账号 | 用户名 + 密码（或 OIDC） | 登录后台、管理用户与密钥 |
| 设备 | **设备用户名** + 任意一把设备密钥 | 注册设备、建立远控通道 |

- 每个用户有一个标准用户名和一个自动生成的虚拟设备用户名（dev-xxxxxxxx）。
- 每把设备密钥可单独生成、单独吊销，并显示当前绑定的设备数；吊销密钥会连带吊销用它注册的设备。
- 设备凭据只查 device_keys 表，与网页密码完全分离——密码不能换设备令牌，设备密钥也不能登录网页。
- 开启「仅允许 SSO」后：网页密码登录被禁用，设备只能用虚拟设备用户名（普通用户名不再可用）；关闭后立即恢复。

## 三条登录路径

1. `POST /api/v1/auth/login` 传用户名密码 → Web 会话 Cookie。
2. `GET /api/v1/auth/oidc/start` → IdP → `GET /api/v1/auth/oidc/callback` → 会话 Cookie。
3. 设备密钥：`POST /api/v1/auth/login` 里把 `password` 填成 deviceKey → 返回一次性注册票据
   → `POST /api/v1/devices/register` 用该票据换设备 access/refresh 令牌。
   也可直接 `POST /api/v1/auth/device-login`（一步完成）。

## 部署

    cp .env.example .env
    docker compose -f docker-compose.multi.yml up -d --build
    curl -s https://your.host/healthz

首次访问 `https://your.host/setup` 创建管理员。

## 已裁剪的范围

- **不再托管原 React SPA**（apps/server/web 仍保留在仓库，但不随服务端发布）。管理入口是服务端渲染的 /setup、/login、/admin。
- **不实现 QR 登录**：它需要移动端配合（渲染与轮询），服务端单侧实现只会产生死代码。设备接入走「用户名 + 设备密钥」。

## 已知限制

- 单写进程：设备/令牌有进程内缓存，扩多副本需加失效广播。
- 邮箱验证码注册与找回已支持，但需先配置 SMTP；未配置时自助入口关闭，只能由管理员建号。
- 限速是进程内令牌桶，重启清零；反向代理后必须设置 DSH_SERVER_TRUSTED_PROXY_IPS，否则全站共用一个匿名桶。
- 审计写入 `audit_log` 表，暂无 UI。

## 运维须知

### 单写进程

设备、令牌、限速桶、注册票据都在进程内缓存，PostgreSQL 只做持久化。因此：

- 只能跑一个副本；多副本会出现"吊销只对本进程生效"和"他副本签发的 refresh 一律 AUTH_INVALID"。
- 重启会丢失未落库的 lastSeenAt 与限速桶，不影响登录与设备令牌（已持久化）。

### 迁移

`src/schema.ts` 描述数据库最终形态，每次启动幂等收敛；没有版本表，也没有按序追加的迁移脚本。首次迁移用 `setup_lock` 主键互斥，保证并发启动只有一个能创建管理员。

### 备份

只有 PostgreSQL 需要备份，数据目录用 `pg_dump`：

    docker compose -f docker-compose.multi.yml exec -T postgres \
      pg_dump -U dsh dsh | gzip > dsh-$(date +%F).sql.gz

注意 `server_settings` 里存有 OIDC client secret、TURN 密码与初始化密钥，备份文件等价于凭据，需按密钥管理。

### 测试

    pnpm --filter @dsh-remote/server test:store

用 pg-mem 在无数据库环境跑三套冒烟：存储层 23 项、运行时配置 16 项、HTTP 面 27 项、端到端生命周期 27 项、注册/找回 23 项、OIDC 分支 16 项、账户自助 15 项、全链路 journey 11 项（共 158 项断言）。
