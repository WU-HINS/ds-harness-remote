import { webAssets } from './assets.js'
// DSH Remote UI



const esc = (value: unknown): string => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
const attr = esc



const themeButton = '<button class="icon-btn" type="button" data-action="theme" title="切换主题" aria-label="切换主题">◐</button>'

const bgStyle = (url?: string): string => (url && /^https:\/\/[A-Za-z0-9._~:/?#\[\]@!$&*+,=%-]+$/i.test(url))
  ? ' style="--app-bg-image:url(&quot;' + esc(url) + '&quot;)" class="has-bg"'
  : ''

const shell = (title: string, body: string, background?: string, surface: 'public' | 'console' = 'public', page = 'none'): string =>
  '<!doctype html><html lang="zh-CN" data-surface="' + surface + '"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>' + esc(title) + ' · DSH Remote</title>' +
  '<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 32 32%22%3E%3Crect width=%2232%22 height=%2232%22 rx=%228%22 fill=%22%235b8cff%22/%3E%3Cpath d=%22M9 21V11l7 5 7-5v10%22 stroke=%22white%22 stroke-width=%222.4%22 fill=%22none%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22/%3E%3C/svg%3E">' +
  '<link rel="stylesheet" href="/assets/' + esc(webAssets?.css ?? '') + '">' +
  '<script src="/assets/' + esc(webAssets?.js ?? '') + '" defer></script>' +
  '</head><body data-page="' + attr(page) + '"' + bgStyle(background) + '><div id="hint" class="hintbar" role="status" aria-live="polite"></div>' + body + '</body></html>'

const ICONS: Record<string, string> = {
  home: '<path d="M3 10.7 12 3l9 7.7"/><path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9.5"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c1.6-3.4 4.2-5 7.5-5s5.9 1.6 7.5 5"/>',
  shield: '<path d="M12 3l7 2.8V12c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V5.8z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
}

const icon = (name: string): string =>
  '<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] ?? '') + '</svg>'

const navlink = (href: string, label: string, active: boolean, iconName: string): string =>
  '<a class="navlink' + (active ? ' active' : '') + '" href="' + href + '"' + (active ? ' aria-current="page"' : '') +
  ' title="' + attr(label) + '">' + icon(iconName) + '<span class="lbl">' + label + '</span></a>'

const cmdPalette = '<dialog id="cmdk" class="palette" aria-label="命令面板">' +
  '<input id="cmdk-input" type="search" placeholder="搜索页面或操作…" aria-label="搜索页面或操作" autocomplete="off">' +
  '<div id="cmdk-list" class="cmdk-list" role="listbox" aria-label="结果"></div></dialog>' +
  ''

const topbar = (user: string, active: string, deviceUsername?: string, isAdmin = false): string =>
  '<a class="skip" href="#main">跳到主内容</a><header class="topbar">' +
  '<a class="brand" href="/" aria-label="DSH Remote 首页"><span class="dot"></span><span class="wordmark">DSH <em>Remote</em></span></a>' +
  '<nav class="nav" aria-label="主导航">' +
  navlink('/', '概览', active === 'home', 'home') +
  navlink('/account', '账户', active === 'account', 'user') +
  (isAdmin ? navlink('/admin', '管理', active === 'admin', 'shield') : '') +
  '</nav><div class="spacer"></div>' +
  '<div class="user"><span class="avatar" aria-hidden="true">' + esc(user.slice(0, 1)) + '</span>' +
  '<span class="who" title="' + attr(deviceUsername ? user + ' · ' + deviceUsername : user) + '">' +
  '<span class="acct">' + esc(user) + '</span>' +
  (deviceUsername ? '<span class="dev-name mono">' + esc(deviceUsername) + '</span>' : '') + '</span></div>' +
  themeButton +
  '<button class="icon-btn cmdk-btn" type="button" id="cmdk-open" aria-label="打开命令面板" aria-keyshortcuts="Meta+K Control+K" title="命令面板 ⌘K">' + icon('search') + '</button>' +
  '<form method="post" action="/api/v1/auth/logout" style="margin:0"><button class="btn ghost sm" type="submit">退出</button></form></header>' + cmdPalette

const card = (title: string, body: string, extra = ''): string =>
  '<section class="card"><h2>' + title + (extra ? '<span class="muted small">' + extra + '</span>' : '') + '</h2>' + body + '</section>'

const table = (headers: string[], bodyId: string, empty: string, label = '数据表'): string =>
  '<div class="table-wrap" tabindex="0" role="region" aria-label="' + attr(label) + '"><table class="table"><thead><tr>' +
  headers.map(h => '<th scope="col">' + h + '</th>').join('') +
  '</tr></thead><tbody id="' + bodyId + '" aria-busy="true">' +
  Array.from({ length: 3 }, () => '<tr>' + headers.map(() => '<td><span class="sk"></span></td>').join('') + '</tr>').join('') +
  '</tbody></table><noscript><p class="muted small">' + empty + '</p></noscript></div>'

const keyDialog = '<dialog id="keydlg" aria-labelledby="keydlgtitle"><h2 id="keydlgtitle" style="border:0;padding:0;margin-bottom:10px">设备密钥</h2>' +
  '<p class="muted small" style="margin:0 0 10px">只显示这一次，请立即保存。</p>' +
  '<div class="code" id="keyvalue"></div>' +
  '<div class="row" style="margin-top:14px"><button class="btn" type="button" id="keycopy">复制</button>' +
  '<button class="btn ghost" type="button" id="keydone">我已保存</button></div></dialog>'

export function setupPage(setupKey: string, suggestedOrigin = '', error?: string): string {
  const key = setupKey.replace(/[^A-Za-z0-9_-]/g, '')
  const origin = suggestedOrigin.startsWith('https://') ? suggestedOrigin : ''
  return shell('初始化', '<main class="hero" id="main"><div class="auth">' +
    '<section class="pitch"><div class="brand" style="margin-bottom:18px"><span class="dot"></span>DSH Remote</div>' +
    '<p class="lead">先把这台服务器<br>认领下来</p>' +
    '<p class="muted">初始化只需要一次：一个管理员邮箱、一个一次性密钥。完成后这台机器就归你管了。</p></section>' +
    '<section class="panel"><h1 style="font-size:22px;margin-bottom:6px">初始化服务器</h1>' +
    '<p class="muted small" style="margin:0 0 20px">一次性密钥见服务端启动日志，也可由 DSH_SETUP_KEY 指定。</p>' +
    '<form method="post" action="/api/v1/setup" class="stack">' +
    '<div><label class="label" for="setup-key">初始化密钥</label><input class="input mono" id="setup-key" name="key" value="' + esc(key) + '" required autocomplete="off"></div>' +
    '<div><label class="label" for="setup-url">公网地址</label><input class="input" id="setup-url" name="publicUrl" type="url" placeholder="https://remote.example.com" value="' + esc(origin) + '"><span class="small muted">仅 https，可稍后在后台修改</span></div>' +
    '<div><label class="label" for="setup-user">管理员邮箱</label><input class="input" id="setup-user" name="username" type="email" required placeholder="you@example.com" autocomplete="username"><span class="small muted">必须使用邮箱，作为登录账号</span></div>' +
    '<div><label class="label" for="setup-pass">密码</label><input class="input" id="setup-pass" name="password" type="password" required minlength="12" placeholder="至少 12 位" autocomplete="new-password"></div>' +
    '<button class="btn block" type="submit">创建管理员</button></form>' +
    (error ? '<div class="alert err" role="alert" style="margin-top:14px">' + esc(error) + '</div>' : '') + '</section></div></main>', undefined, 'public', 'setup')
}

export function loginPage(oidcEnabled: boolean, error?: string, background?: string): string {
  return shell('登录', '<main class="hero" id="main"><div class="auth">' +
    '<section class="pitch" aria-hidden="true"><div class="brand" style="margin-bottom:18px"><span class="dot"></span>DSH Remote</div>' +
    '<p class="lead">你的 Harness，<br>在哪儿都能用</p>' +
    '<p class="muted">登录后即可管理账号、设备与在线主机。所有业务流量端到端加密，服务器只转发密文。</p></section>' +
    '<section class="panel"><div class="row" style="justify-content:space-between"><h1 style="font-size:clamp(20px,4.6vw,22px)">登录</h1>' + themeButton + '</div>' +
    '<form method="post" action="/api/v1/auth/login" class="stack" style="margin-top:18px">' +
    '<div><label class="label" for="login-user">邮箱</label><input class="input" id="login-user" name="username" type="email" autocomplete="username" required placeholder="you@example.com"></div>' +
    '<div><label class="label" for="login-pass">密码</label><input class="input" id="login-pass" name="password" type="password" autocomplete="current-password" required placeholder="••••••••"></div>' +
    '<button class="btn block" type="submit">登录</button></form>' +
    (oidcEnabled ? '<div class="divider"></div><a class="btn ghost block" href="/api/v1/auth/oidc/start">使用 SSO 登录</a>' : '') +
    '<p class="small muted" style="margin:16px 0 0"><a href="/register">注册</a> · <a href="/forgot">忘记密码</a></p>' +
    (error ? '<div class="alert err" role="alert" style="margin-top:14px">' + esc(error) + '</div>' : '') + '</section></div></main>', background, 'public', 'login')
}

export function registerPage(onlySso: boolean, background?: string): string {
  if (onlySso) {
    return shell('注册', '<main class="hero" id="main"><section class="panel" style="max-width:460px;text-align:center">' +
      '<h1 style="font-size:22px">注册已关闭</h1><p class="muted">本站已启用仅 SSO，账号由身份提供方创建。</p>' +
      '<a class="btn ghost" href="/login">返回登录</a></section></main>', background, 'public', 'register')
  }
  return shell('注册', '<main class="hero" id="main"><section class="panel" style="max-width:520px">' +
    '<h1 style="font-size:22px;margin-bottom:6px">创建账户</h1><p class="muted small" style="margin:0 0 18px">需要邮箱验证码。</p>' +
    '<form id="reg" method="post" action="/api/v1/auth/register/complete" class="stack">' +
    '<div><label class="label" for="reg-email">邮箱</label><input class="input" id="reg-email" name="email" type="email" required placeholder="you@example.com" autocomplete="email"></div>' +
    '<div class="row" style="align-items:flex-end"><div style="flex:1"><label class="label" for="reg-code">验证码</label><input class="input" id="reg-code" name="code" inputmode="numeric" maxlength="6" required placeholder="6 位数字"></div><button class="btn ghost" type="button" id="reg-send">发送验证码</button></div>' +
    '<div><label class="label" for="reg-pass">密码</label><input class="input" id="reg-pass" name="password" type="password" required minlength="12" placeholder="至少 12 位" autocomplete="new-password"></div>' +
    '<button class="btn block" type="submit">创建账户</button></form>' +
    '<p class="small muted" style="margin-top:16px"><a href="/login">返回登录</a></p>' +
    '<div id="reg-out" role="status" aria-live="polite"></div></section></main>' +
    '<noscript><p class="alert" style="position:fixed;bottom:0;left:0;right:0">脚本已禁用：请先在有脚本的浏览器完成注册。</p></noscript>' +
    '', background, 'public', 'register')
}

export function forgotPage(onlySso: boolean, background?: string): string {
  if (onlySso) {
    return shell('找回密码', '<main class="hero" id="main"><section class="panel" style="max-width:460px;text-align:center">' +
      '<h1 style="font-size:22px">找回密码已禁用</h1><p class="muted">仅 SSO 模式下请通过身份提供方登录。</p>' +
      '<a class="btn ghost" href="/login">返回登录</a></section></main>', background, 'public', 'forgot')
  }
  return shell('找回密码', '<main class="hero" id="main"><section class="panel" style="max-width:520px">' +
    '<h1 style="font-size:22px;margin-bottom:6px">重置密码</h1><p class="muted small" style="margin:0 0 18px">验证码会发送到你的邮箱。</p>' +
    '<form id="fg" method="post" action="/api/v1/auth/password/reset/complete" class="stack">' +
    '<div><label class="label" for="fg-email">邮箱</label><input class="input" id="fg-email" name="email" type="email" required placeholder="you@example.com" autocomplete="email"></div>' +
    '<div class="row" style="align-items:flex-end"><div style="flex:1"><label class="label" for="fg-code">验证码</label><input class="input" id="fg-code" name="code" inputmode="numeric" maxlength="6" required></div><button class="btn ghost" type="button" id="fg-send">发送验证码</button></div>' +
    '<div><label class="label" for="fg-pass">新密码</label><input class="input" id="fg-pass" name="password" type="password" required minlength="12" placeholder="至少 12 位" autocomplete="new-password"></div>' +
    '<button class="btn block" type="submit">重置密码</button></form>' +
    '<p class="small muted" style="margin-top:16px"><a href="/login">返回登录</a></p></section></main>' +
    '', background, 'public', 'forgot')
}

export function bindPage(email: string, onlySso: boolean, background?: string): string {
  return shell('绑定账户', '<main class="hero" id="main"><section class="panel" style="max-width:520px">' +
    '<h1 style="font-size:22px;margin-bottom:6px">绑定已有账户</h1>' +
    '<p class="muted small" style="margin:0 0 18px">邮箱 ' + esc(email) + ' 已注册但尚未绑定此 SSO 身份。</p>' +
    '<div class="stack">' +
    '<div><label class="label" for="bind-mode">验证方式</label><select class="input" id="bind-mode">' +
    (onlySso ? '' : '<option value="password">账户密码</option>') + '<option value="code">邮箱验证码</option></select></div>' +
    '<div id="bind-pw"' + (onlySso ? ' style="display:none"' : '') + '><label class="label" for="bind-pass">密码</label><input class="input" id="bind-pass" type="password"></div>' +
    '<div id="bind-cd" style="display:none"><div class="row" style="align-items:flex-end"><div style="flex:1"><label class="label" for="bind-code">验证码</label><input class="input" id="bind-code" inputmode="numeric" maxlength="6"></div><button class="btn ghost" type="button" id="bind-send">发送验证码</button></div></div>' +
    '<button class="btn block" type="button" id="bind-submit">绑定并登录</button></div></section></main>' +
    '', background, 'public', 'bind')
}

export function homePage(username: string, role: string, deviceUsername = ''): string {
  return shell('概览', topbar(username, 'home', deviceUsername, role === 'admin') + '<main class="wrap" id="main">' +
    '<div class="grid-phi"><div>' +
    '<section class="card"><h1 style="font-size:clamp(20px,4.6vw,26px)">你好，' + esc(username) + '</h1>' +
    '<p class="muted" style="margin:10px 0 0">从这里管理账户、设备与这台服务器。业务流量端到端加密，服务器只转发密文。</p></section>' +
    '<div class="stats" style="margin-top:var(--s3)">' +
    '<div class="stat"><div class="muted small">当前角色</div><div class="n">' + (role === 'admin' ? '管理员' : '普通用户') + '</div></div>' +
    '<div class="stat"><div class="muted small">已登记设备</div><div class="n" id="deviceCount">—</div></div>' +
    '<div class="stat"><div class="muted small">服务状态</div><div class="n" id="health">—</div></div></div>' +
    '</div><aside>' + card('快捷入口', '<div class="stack">' +
      '<a class="btn ghost block" href="/account">账户与安全</a>' +
      (role === 'admin' ? '<a class="btn ghost block" href="/admin">用户与设备管理</a>' : '') +
      '</div>') + '</aside></div></main>' +
    '', undefined, 'console', 'home')
}

const accountTabs = (active: 'profile' | 'devices' | 'keys'): string =>
  '<nav class="subnav" aria-label="账户分区">' +
  [['profile', '账户', '/account'], ['devices', '我的设备', '/account/devices'], ['keys', '设备密钥', '/account/keys']]
    .map(([id, label, href]) => '<a class="subtab' + (active === id ? ' active' : '') + '" href="' + href + '"' + (active === id ? ' aria-current="page"' : '') + '>' + label + '</a>').join('') +
  '</nav>'

export function accountPage(username: string, email: string, oidcBound: boolean, onlySso: boolean, background?: string, deviceUsername = '', isAdmin = false): string {
  const passwordCard = onlySso
    ? card('修改密码', '<p class="muted small" style="margin:0">仅 SSO 模式已启用，密码修改不可用。</p>')
    : card('修改密码', '<div class="stack">' +
        '<div><label class="label" for="cur-pass">当前密码</label><input class="input" id="cur-pass" type="password" autocomplete="current-password"></div>' +
        '<div><label class="label" for="new-pass">新密码</label><input class="input" id="new-pass" type="password" placeholder="至少 12 位" autocomplete="new-password"></div>' +
        '<button class="btn" type="button" id="change-pw">保存</button></div>')
  return shell('我的账户', topbar(username, 'account', deviceUsername, isAdmin) + accountTabs('profile') + '<main class="wrap" id="main"><h1 class="sr-only">我的账户</h1><div class="grid-phi"><div>' +
    card('账户', '<div class="grid-2">' +
      '<div><div class="label">登录邮箱</div><div class="mono">' + esc(email || '未设置') + '</div></div>' +
      '<div><div class="label">邮箱状态</div><div><span class="badge">' + (email ? '已验证' : '未设置') + '</span></div></div>' +
      '<div><div class="label">设备用户名</div><div class="mono">' + esc(deviceUsername || '—') + '</div></div>' +
      '<div><div class="label">账号标识</div><div class="mono">' + esc(username) + '</div></div></div>') +
    card('换绑邮箱', '<div class="stack">' +
      '<div><label class="label" for="new-email">新邮箱</label><input class="input" id="new-email" type="email" placeholder="new@example.com" autocomplete="email"></div>' +
      '<div><button class="btn ghost" type="button" id="send-code">发送验证码</button></div>' +
      '<div class="grid-2"><div><label class="label" for="new-code">新邮箱验证码</label><input class="input" id="new-code" maxlength="6" inputmode="numeric"></div>' +
      '<div><label class="label" for="old-code">原邮箱验证码</label><input class="input" id="old-code" maxlength="6" inputmode="numeric"></div></div>' +
      '<button class="btn" type="button" id="change-email">确认换绑</button></div>') +
    passwordCard + '</div><aside>' +
    card('安全提示', '<p class="muted small" style="margin:0">设备用「设备用户名 + 设备密钥」登录，与网页密码相互独立。吊销密钥会让对应设备立即下线。</p>') +
    card('单点登录', '<p class="muted small" style="margin:0 0 12px">' + (oidcBound ? '已绑定 OIDC 身份。' : '尚未绑定 OIDC 身份。') + '</p>' +
      '<div class="stack"><a class="btn ghost block" href="/api/v1/auth/oidc/start">绑定 / 重新绑定</a>' +
      (onlySso || !oidcBound ? '' : '<button class="btn danger block" type="button" id="unbind">解绑</button>') + '</div>') +
    '</aside></div></main>' ,
     background, 'console', 'account')
}

export function accountDevicesPage(username: string, background?: string, deviceUsername = '', isAdmin = false): string {
  return shell('我的设备', topbar(username, 'account', deviceUsername, isAdmin) + accountTabs('devices') + '<main class="wrap" id="main"><h1 class="sr-only">我的设备</h1>' +
    card('我的设备', '<div class="toolbar">' +
      '<input class="input" id="q" type="search" placeholder="搜索设备名或系统" aria-label="搜索设备">' +
      '<div class="chips" role="group" aria-label="按角色筛选"><button class="chip" data-role="all" aria-pressed="true">全部</button><button class="chip" data-role="host" aria-pressed="false">主机</button><button class="chip" data-role="client" aria-pressed="false">客户端</button></div>' +
      '<div class="chips" role="group" aria-label="按状态筛选"><button class="chip" data-online="all" aria-pressed="true">全部状态</button><button class="chip" data-online="online" aria-pressed="false">在线</button><button class="chip" data-online="offline" aria-pressed="false">离线</button></div></div>' +
      '<div class="table-scroll" tabindex="0" role="region" aria-label="设备列表"><table class="table"><thead><tr><th scope="col">设备</th><th scope="col">角色</th><th scope="col">系统</th><th scope="col">插件版本</th><th scope="col">DSH 版本</th><th scope="col">状态</th><th scope="col">最近在线</th></tr></thead><tbody id="devices" aria-live="polite"><tr><td colspan="7"><span class="sk"></span></td></tr><tr><td colspan="7"><span class="sk"></span></td></tr><tr><td colspan="7"><span class="sk"></span></td></tr></tbody></table></div>' +
      '<p class="small muted" style="margin:10px 0 0">设备列表按账号隔离；在「设备密钥」页吊销密钥会让对应设备立即下线。</p>', '仅你自己可见') +
    '</main>' ,
     background, 'console', 'devices')
}

export function accountKeysPage(username: string, background?: string, deviceUsername = '', isAdmin = false): string {
  return shell('设备密钥', topbar(username, 'account', deviceUsername, isAdmin) + accountTabs('keys') + '<main class="wrap" id="main"><h1 class="sr-only">设备密钥</h1>' +
    card('设备密钥', '<div class="toolbar"><input class="input" id="q" type="search" placeholder="搜索标签" aria-label="搜索密钥">' +
      '<div class="chips" role="group" aria-label="按状态筛选"><button class="chip" data-state="all" aria-pressed="true">全部</button><button class="chip" data-state="active" aria-pressed="false">正常</button><button class="chip" data-state="revoked" aria-pressed="false">已吊销</button></div></div>' +
      '<div class="table-scroll sticky-actions" tabindex="0" role="region" aria-label="设备密钥列表"><table class="table"><thead><tr><th scope="col">标签</th><th scope="col">设备数</th><th scope="col">状态</th><th scope="col">密钥</th><th scope="col">创建时间</th><th scope="col">操作</th></tr></thead><tbody id="keys" aria-live="polite"><tr><td colspan="6"><span class="sk"></span></td></tr><tr><td colspan="6"><span class="sk"></span></td></tr><tr><td colspan="6"><span class="sk"></span></td></tr></tbody></table></div>' +
      '<div class="row" style="margin-top:12px"><div style="flex:1;min-width:200px"><label class="label" for="key-label">新密钥标签</label><input class="input" id="key-label" placeholder="例如 客厅 iPad" maxlength="64"></div>' +
      '<button class="btn" type="button" id="create-key">生成密钥</button></div>' +
      '<p class="small muted" style="margin:10px 0 0">密钥随时可以查看和复制；吊销后用它接入的设备会立即掉线，且同一设备无法重新接入。</p>', '仅你自己可见') +
    '</main>' ,
     background, 'console', 'keys')
}

const adminTabs = (active: 'people' | 'settings'): string =>
  '<nav class="subnav" aria-label="管理分区">' +
  '<a class="subtab' + (active === 'people' ? ' active' : '') + '" href="/admin"' + (active === 'people' ? ' aria-current="page"' : '') + '>用户与设备</a>' +
  '<a class="subtab' + (active === 'settings' ? ' active' : '') + '" href="/admin/settings"' + (active === 'settings' ? ' aria-current="page"' : '') + '>设置</a>' +
  '</nav>'

const settingsAnchors = [
  ['server', '服务地址'], ['appearance', '外观'], ['smtp', 'SMTP'], ['oidc', 'OIDC'], ['limits', '限额与 ICE'],
]

const anchorsNav = (): string =>
  '<nav class="anchors" aria-label="本页目录">' +
  settingsAnchors.map(([id, label]) => '<a href="#' + id + '">' + label + '</a>').join('') +
  '</nav>'

export function adminPage(username: string, background?: string, deviceUsername = ''): string {
  return shell('用户与设备', topbar(username, 'admin', deviceUsername, true) + adminTabs('people') + '<main class="wrap" id="main"><h1 class="sr-only">用户与设备</h1><div class="grid-phi"><div>' +
    card('用户', table(['邮箱 / 用户名', '设备用户名', '角色', '密钥', '操作'], 'rows', '还没有用户', '用户列表') +
      '<div class="divider"></div><div class="grid-2">' +
      '<div><label class="label" for="nu">新建邮箱</label><input class="input" id="nu" type="email" placeholder="user@example.com" autocomplete="off"></div>' +
      '<div><label class="label" for="np">初始密码（可留空）</label><input class="input" id="np" type="password" autocomplete="new-password"></div></div>' +
      '<div class="row" style="margin-top:12px"><div style="min-width:140px"><label class="label" for="nr">角色</label><select class="input" id="nr"><option value="user">user</option><option value="admin">admin</option></select></div>' +
      '<button class="btn" type="button" id="create-user">创建用户</button></div>', '共 <span id="userCount">0</span> 人') +
    card('设备', table(['用户', '设备', '角色', '状态', '操作'], 'devices', '还没有设备接入', '设备列表')) +
    card('最近审计', table(['时间', '操作者', '动作'], 'audit', '暂无审计记录', '审计日志')) +
    '</div><aside>' +
    card('权限边界', '<p class="muted small" style="margin:0 0 10px">管理员只能<b>创建、禁用、删除</b>普通用户。管理员账号本身不可禁用或删除。</p>' +
      '<p class="muted small" style="margin:0">设备密钥、设备列表与密码均由用户在自己的「我的账户」里管理，管理员无法代为操作或查看。</p>' +
      '<a class="btn ghost block" style="margin-top:12px" href="/admin/settings">前往设置</a>') +
    card('安全提示', '<p class="muted small" style="margin:0">删除用户会同时吊销其全部设备与会话，且不可恢复。</p>') +
    '</aside></div></main>' ,
     background, 'console', 'admin')
}

export function adminSettingsPage(username: string, background?: string, deviceUsername = ''): string {
  return shell('设置', topbar(username, 'admin', deviceUsername, true) + adminTabs('settings') + '<main class="wrap" id="main"><h1 class="sr-only">设置</h1><div class="grid-phi"><div>' +
    '<section class="card" id="server"><h2>服务地址</h2><div class="stack">' +
    '<div><label class="label" for="public-url">公网地址</label><input class="input" id="public-url" placeholder="https://remote.example.com"><span class="small muted">仅 https，留空则按请求推导</span></div>' +
    '<div><label class="label" for="trusted-proxies">额外可信代理</label><input class="input" id="trusted-proxies" placeholder="203.0.113.7, 2001:db8::2"><span class="small muted">内网与回环默认信任</span></div>' +
    '<div><button class="btn" type="button" id="save-server">保存服务地址</button></div></div></section>' +
    '<section class="card" id="appearance"><h2>外观</h2><div class="stack">' +
    '<div><label class="label" for="bg-url">登录页背景</label><input class="input" id="bg-url" placeholder="https://t.hinswu.top/pixiv"><span class="small muted">仅 https；留空用默认图</span></div>' +
    '<div><button class="btn" type="button" id="save-ui">保存外观</button></div></div></section>' +
    '<section class="card" id="smtp"><h2>SMTP</h2><div class="stack">' +
    '<div class="grid-2"><div><label class="label" for="smtp-host">Host</label><input class="input" id="smtp-host"></div><div><label class="label" for="smtp-port">Port</label><input class="input" id="smtp-port" type="number" value="587"></div></div>' +
    '<label class="row small" for="smtp-secure"><input type="checkbox" id="smtp-secure" style="width:auto"> 直接 TLS（465）</label>' +
    '<div class="grid-2"><div><label class="label" for="smtp-user">用户名</label><input class="input" id="smtp-user"></div><div><label class="label" for="smtp-pass">密码（留空不修改）</label><input class="input" id="smtp-pass" type="password" autocomplete="new-password"></div></div>' +
    '<div><label class="label" for="smtp-from">发件人</label><input class="input" id="smtp-from"></div>' +
    '<div class="row"><button class="btn" type="button" id="save-smtp">保存 SMTP</button><button class="btn ghost" type="button" id="test-smtp">发送测试</button>' +
    '<input class="input" id="smtp-test-to" aria-label="测试收件人" placeholder="test@example.com" style="max-width:220px"></div></div></section>' +
    '<section class="card" id="oidc"><h2>OIDC</h2><div class="stack">' +
    '<label class="row small" for="oidc-enabled"><input type="checkbox" id="oidc-enabled" style="width:auto"> 启用 OIDC</label>' +
    '<label class="row small" for="only-sso"><input type="checkbox" id="only-sso" style="width:auto"> 仅允许 SSO</label>' +
    '<label class="row small" for="bind-require"><input type="checkbox" id="bind-require" style="width:auto"> 绑定已有账户需二次校验</label>' +
    '<div><label class="label" for="issuer">Issuer</label><input class="input" id="issuer" placeholder="https://idp.example.com"></div>' +
    '<div><label class="label" for="client-id">Client ID</label><input class="input" id="client-id"></div>' +
    '<div><label class="label" for="client-secret">Client Secret（留空不修改）</label><input class="input" id="client-secret" type="password" autocomplete="new-password"></div>' +
    '<div><label class="label" for="scopes">Scopes</label><input class="input" id="scopes" value="openid email profile"></div>' +
    '<div><label class="label" for="allowed-domains">允许邮箱域</label><input class="input" id="allowed-domains" placeholder="example.com"></div>' +
    '<div><button class="btn" type="button" id="save-oidc">保存 OIDC</button></div></div></section>' +
    '<section class="card" id="limits"><h2>限额与 ICE</h2><div class="stack">' +
    '<div class="grid-2"><div><label class="label" for="session-ttl">会话 TTL(ms)</label><input class="input" id="session-ttl" type="number"></div>' +
    '<div><label class="label" for="conn-limit">并发连接</label><input class="input" id="conn-limit" type="number"></div>' +
    '<div><label class="label" for="user-rate">用户/分钟</label><input class="input" id="user-rate" type="number"></div>' +
    '<div><label class="label" for="anon-rate">匿名/分钟</label><input class="input" id="anon-rate" type="number"></div></div>' +
    '<div><label class="label" for="stun">STUN</label><input class="input" id="stun"></div>' +
    '<div><label class="label" for="turn">TURN</label><input class="input" id="turn"></div>' +
    '<div class="grid-2"><div><label class="label" for="turn-user">TURN 用户名</label><input class="input" id="turn-user"></div><div><label class="label" for="turn-pass">TURN 密码</label><input class="input" id="turn-pass" type="password" autocomplete="new-password"></div></div>' +
    '<div><button class="btn" type="button" id="save-limits">保存限额</button></div></div></section>' +
    '</div><aside>' + anchorsNav() +
    card('生效方式', '<p class="muted small" style="margin:0">所有设置写入数据库并立即生效；端口、数据库与初始化密钥仍在环境变量中。</p>') +
    '</aside></div></main>' ,
     background, 'console', 'admin-settings')
}
