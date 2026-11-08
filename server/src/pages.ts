// DSH Remote UI

const CSS = [
  ':root{--phi:1.618;--s1:8px;--s2:13px;--s3:21px;--s4:34px;--bg:#0a0d13;--surface:#111722;--surface2:#161e2c;--line:#22304a;--text:#e7eef8;--muted:#8d9bb1;--accent:#3f6fe0;--accent-deep:#3157c9;--accent2:#8fb0ff;--ok:#3fb950;--warn:#d29922;--danger:#f85149;--radius:16px;--r-sm:10px;--shadow:0 18px 50px rgba(0,0,0,.45);--ring:0 0 0 3px rgba(63,111,224,.28);--overlay:rgba(6,9,14,.72);--overlay-2:rgba(6,9,14,.92);--on-accent:#fff;color-scheme:dark}',
  '@media (prefers-color-scheme:light){:root{--bg:#f5f7fb;--surface:#fff;--surface2:#f0f3f9;--line:#dde3ee;--text:#101623;--muted:#5d6b82;--accent:#2f5cc4;--accent-deep:#24479c;--accent2:#2f5cc4;--ok:#1a7f37;--warn:#9a6700;--danger:#cf222e;--shadow:0 12px 32px rgba(16,22,35,.10);--ring:0 0 0 3px rgba(47,92,196,.2);--overlay:rgba(245,247,251,.82);--overlay-2:rgba(245,247,251,.94);color-scheme:light}}',
  '[data-theme=light]{--bg:#f5f7fb;--surface:#fff;--surface2:#f0f3f9;--line:#dde3ee;--text:#101623;--muted:#5d6b82;--accent:#2f5cc4;--accent-deep:#24479c;--accent2:#2f5cc4;--ok:#1a7f37;--warn:#9a6700;--danger:#cf222e;--shadow:0 12px 32px rgba(16,22,35,.10);--ring:0 0 0 3px rgba(47,92,196,.2);--overlay:rgba(245,247,251,.82);--overlay-2:rgba(245,247,251,.94);color-scheme:light}',
  '[data-theme=dark]{--bg:#0a0d13;--surface:#111722;--surface2:#161e2c;--line:#22304a;--text:#e7eef8;--muted:#8d9bb1;--accent:#3f6fe0;--accent-deep:#3157c9;--accent2:#8fb0ff;--ok:#3fb950;--warn:#d29922;--danger:#f85149;--shadow:0 18px 50px rgba(0,0,0,.45);--ring:0 0 0 3px rgba(63,111,224,.28);--overlay:rgba(6,9,14,.72);--overlay-2:rgba(6,9,14,.92);color-scheme:dark}',
  '*{box-sizing:border-box}', 'html,body{height:100%}',
  'body{margin:0;font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans SC",sans-serif;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased}',
  'body.has-bg{background-image:linear-gradient(180deg,var(--overlay),var(--overlay-2)),var(--bg-image);background-size:cover;background-attachment:fixed;background-position:center}',
  'a{color:var(--accent2);text-decoration:none}a:hover{text-decoration:underline}',
  'h1,h2,h3{margin:0;font-weight:650;letter-spacing:-.015em}h1{font-size:clamp(24px,2.6vw,30px)}h2{font-size:19px}h3{font-size:15px}',
  '.lead{font-size:clamp(26px,3.4vw,40px);line-height:1.15;font-weight:650;letter-spacing:-.02em;margin:0}',
  '.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}',
  '.muted{color:var(--muted)}.small{font-size:12.5px}',
  '.skip{position:absolute;left:-9999px;top:0}.skip:focus{left:12px;top:12px;z-index:99;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:8px 12px}',
  ':focus-visible{outline:2px solid var(--accent2);outline-offset:2px}',
  '.topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:var(--s2);padding:14px clamp(16px,3vw,40px);backdrop-filter:blur(14px);background:color-mix(in srgb,var(--bg) 72%,transparent);border-bottom:1px solid var(--line)}',
  '.brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.02em}',
  '.brand .dot{width:26px;height:26px;border-radius:9px;background:linear-gradient(135deg,var(--accent),var(--accent2));box-shadow:0 6px 18px color-mix(in srgb,var(--accent) 40%,transparent)}',
  '.topbar .spacer{flex:1}',
  '@media (max-width:560px){.topbar{gap:10px;padding:10px 14px}.topbar .who{display:none}.topbar nav a{padding:2px 0}}',
  '.wrap{max-width:1180px;margin:0 auto;padding:clamp(18px,3vw,40px)}',
  '.grid-phi{display:grid;grid-template-columns:var(--phi)fr 1fr;gap:var(--s4);align-items:start}',
  '.grid-phi>*{min-width:0}',
  '@media (max-width:900px){.grid-phi{grid-template-columns:1fr}}',
  '.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:var(--s3);box-shadow:var(--shadow)}',
  '.card+.card{margin-top:var(--s3)}',
  '.card h2{display:flex;align-items:center;justify-content:space-between;gap:10px;padding-bottom:12px;margin-bottom:14px;border-bottom:1px solid var(--line)}',
  '.stack{display:flex;flex-direction:column;gap:var(--s2)}.row{display:flex;gap:var(--s1);align-items:center;flex-wrap:wrap}',
  '.label{display:block;font-size:12.5px;font-weight:600;color:var(--muted);margin:0 0 6px;letter-spacing:.02em}',
  '.input,select,textarea{width:100%;padding:11px 13px;border-radius:var(--r-sm);border:1px solid var(--line);background:var(--surface2);color:var(--text);font:inherit}',
  '.input:focus,select:focus,textarea:focus{border-color:var(--accent);box-shadow:var(--ring);outline:none}',
  '.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:40px;padding:0 18px;border-radius:var(--r-sm);border:1px solid transparent;background:linear-gradient(135deg,var(--accent),var(--accent-deep));color:var(--on-accent);font:inherit;font-weight:600;cursor:pointer;transition:filter .12s,transform .12s}',
  '.btn:hover{filter:brightness(.94)}.btn:active{transform:translateY(1px)}',
  '.btn[disabled]{opacity:.55;cursor:not-allowed}',
  '.btn.ghost{background:transparent;border-color:var(--line);color:var(--text)}',
  '.btn.ghost:hover{background:var(--surface2)}',
  '.btn.danger{background:transparent;border-color:color-mix(in srgb,var(--danger) 55%,transparent);color:var(--danger)}',
  '.btn.sm{min-height:32px;padding:0 11px;font-size:12.5px;border-radius:8px}',
  '.btn.block{width:100%}',
  '.table-wrap{overflow-x:auto;margin:0 -2px}',
  '.table{width:100%;border-collapse:collapse;min-width:480px}',
  '.table th{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);text-align:left;padding:8px;border-bottom:1px solid var(--line)}',
  '.table td{padding:10px 8px;border-bottom:1px solid color-mix(in srgb,var(--line) 60%,transparent);font-size:13.5px;vertical-align:middle}',
  '.table tr:last-child td{border-bottom:0}',
  '.table .actions{display:flex;gap:6px;flex-wrap:wrap}',
  '.badge{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:999px;font-size:11.5px;background:var(--surface2);border:1px solid var(--line);color:var(--muted)}',
  '.badge.ok{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 40%,transparent)}',
  '.badge.off{color:var(--danger);border-color:color-mix(in srgb,var(--danger) 40%,transparent)}',
  '.alert{padding:11px 14px;border-radius:var(--r-sm);border:1px solid var(--line);background:var(--surface2);font-size:13.5px}',
  '.alert.err{border-color:color-mix(in srgb,var(--danger) 45%,transparent);color:var(--danger)}',
  '.alert.ok{border-color:color-mix(in srgb,var(--ok) 45%,transparent);color:var(--ok)}',
  '.hero{min-height:100dvh;display:grid;place-items:center;padding:28px}',
  '.auth{width:min(1040px,100%);display:grid;grid-template-columns:var(--phi)fr 1fr;gap:clamp(20px,4vw,56px);align-items:center}',
  '@media (max-width:860px){.auth{grid-template-columns:1fr}.auth .pitch{display:none}}',
  '.pitch p{color:var(--muted);max-width:34ch}',
  '.panel{background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:clamp(22px,3vw,34px);box-shadow:var(--shadow)}',
  '.stat{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:18px}',
  '.stat .n{font-size:24px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}',
  '.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:var(--s2)}',
  '.toast{position:fixed;right:18px;bottom:18px;z-index:60;display:flex;flex-direction:column;gap:8px;max-width:min(420px,90vw)}',
  '.toast div{padding:11px 14px;border-radius:12px;border:1px solid var(--line);background:var(--surface);box-shadow:var(--shadow);font-size:13.5px}',
  '.toast .err{border-color:color-mix(in srgb,var(--danger) 45%,transparent);color:var(--danger)}',
  '.toast .ok{border-color:color-mix(in srgb,var(--ok) 45%,transparent);color:var(--ok)}',
  '.divider{height:1px;background:var(--line);margin:16px 0}',
  '.icon-btn{width:36px;height:36px;display:inline-grid;place-items:center;border-radius:10px;border:1px solid var(--line);background:var(--surface2);color:var(--text);cursor:pointer}',
  '.kbd{font-family:ui-monospace,monospace;font-size:12px;padding:2px 6px;border-radius:6px;background:var(--surface2);border:1px solid var(--line)}',
  '.code{font-family:ui-monospace,monospace;font-size:12.5px;word-break:break-all;background:var(--surface2);border:1px solid var(--line);border-radius:10px;padding:10px 12px}',
  '.grid-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:var(--s2)}',
  '@view-transition{navigation:auto}',
  '::view-transition-old(root){animation:vt-out .18s ease both}',
  '::view-transition-new(root){animation:vt-in .30s cubic-bezier(.2,.7,.2,1) both}',
  '@keyframes vt-out{to{opacity:0;transform:translateY(-6px) scale(.995)}}',
  '@keyframes vt-in{from{opacity:0;transform:translateY(10px) scale(.995)}}',
  '.topbar{view-transition-name:topbar}',
  'main.hero,.wrap{view-transition-name:content}',
  '::view-transition-old(topbar){animation:none}::view-transition-new(topbar){animation:none}',
  'body{animation:page-in .26s ease both}',
  '@keyframes page-in{from{opacity:0}to{opacity:1}}',
  '@supports (view-transition-name:none){body{animation:none}}',
  'body.leaving{opacity:0;transition:opacity .16s ease}',
  '.card{animation:rise .34s ease both}',
  '.card:nth-of-type(2){animation-delay:.04s}.card:nth-of-type(3){animation-delay:.08s}.card:nth-of-type(4){animation-delay:.12s}',
  '@keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
  'dialog{border:1px solid var(--line);border-radius:18px;background:var(--surface);color:var(--text);padding:22px;max-width:min(560px,92vw);box-shadow:var(--shadow)}',
  'dialog::backdrop{background:rgba(0,0,0,.55)}',
  '@media (prefers-reduced-motion:reduce){::view-transition-old(root),::view-transition-new(root),.card,body{animation:none!important;transition:none!important}}',
].join('');

const esc = (value: unknown): string => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
const attr = esc

const APP_JS = [
  'function dshEsc(v){return String(v==null?"":v).replace(/[&<>"\\\']/g,function(c){return ({"&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;","\\\'":"&#39;"})[c]})}',
  'function dshToast(msg,kind){var box=document.getElementById("toasts");if(!box){box=document.createElement("div");box.id="toasts";box.className="toast";box.setAttribute("role","status");box.setAttribute("aria-live","polite");document.body.appendChild(box)}var t=document.createElement("div");t.className=kind||"ok";t.textContent=msg;box.appendChild(t);setTimeout(function(){t.remove()},5000)}',
  'function dshErr(code,status){var map={AUTH_INVALID:"邮箱或密码不正确",EMAIL_UNVERIFIED:"邮箱尚未验证",SSO_ONLY:"已启用仅 SSO，请用身份提供方登录",CODE_INVALID:"验证码不正确或已过期",EMAIL_TAKEN:"该邮箱已被使用",EMAIL_RATE_LIMITED:"发送过于频繁，请 60 秒后重试",EMAIL_QUOTA_EXCEEDED:"该邮箱今日验证码次数已用完",RATE_LIMITED:"请求过于频繁，请稍后重试",SMTP_NOT_CONFIGURED:"服务端未配置 SMTP，请联系管理员",INVALID_EMAIL:"邮箱格式不正确",SETUP_REQUIRED:"服务尚未初始化",OIDC_EXPIRED:"绑定会话已过期，请重新登录",DEVICE_KEY_REQUIRED:"需要设备密钥"};return map[code]||("操作失败（"+(code||status)+"）")}',
  'function dshApi(path,opts){return fetch(path,opts).then(function(r){return r.json().catch(function(){return {}}).then(function(b){return {ok:r.ok,status:r.status,body:b}})})}',
  'function dshPost(path,body){return dshApi(path,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body||{})})}',
  'function dshPut(path,body){return dshApi(path,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(body||{})})}',
  'function dshDel(path){return dshApi(path,{method:"DELETE"})}',
  'function dshCopy(text){if(navigator.clipboard){navigator.clipboard.writeText(text).then(function(){dshToast("已复制","ok")},function(){dshToast("复制失败，请手动选择","err")})}else{dshToast("请手动选择复制","err")}}',
  'function toggleTheme(){var d=document.documentElement;var n=d.dataset.theme==="light"?"dark":"light";d.dataset.theme=n;try{localStorage.setItem("dsh-theme",n)}catch(e){}}',
  'document.addEventListener("DOMContentLoaded",function(){',
  'try{var t=localStorage.getItem("dsh-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}',
  'window.addEventListener("pageshow",function(){document.body.classList.remove("leaving")});',
  'var reduce=window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;',
  'if("startViewTransition" in document||reduce)return;',
  'document.addEventListener("click",function(e){var a=e.target&&e.target.closest?e.target.closest("a"):null;',
  'if(!a||a.target||a.hasAttribute("download")||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0)return;',
  'var u=new URL(a.href,location.href);if(u.origin!==location.origin)return;',
  'e.preventDefault();document.body.classList.add("leaving");setTimeout(function(){location.href=u.href},170)})});',
].join('')

const THEME = '<script>' + APP_JS + '</script>'
const themeButton = '<button class="icon-btn" type="button" onclick="toggleTheme()" title="切换主题" aria-label="切换主题">◐</button>'

const bgStyle = (url?: string): string => (url && /^https:\/\/[A-Za-z0-9._~:/?#\[\]@!$&*+,=%-]+$/i.test(url))
  ? ' style="--bg-image:url(&quot;' + esc(url) + '&quot;)" class="has-bg"'
  : ''

const shell = (title: string, body: string, background?: string): string =>
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>' + esc(title) + ' · DSH Remote</title><style>' + CSS + '</style>' + THEME +
  '</head><body' + bgStyle(background) + '><div id="toasts" class="toast" role="status" aria-live="polite"></div>' + body + '</body></html>'

const topbar = (user: string, active: string): string =>
  '<a class="skip" href="#main">跳到主内容</a><header class="topbar"><div class="brand"><span class="dot"></span>DSH Remote</div>' +
  '<nav class="row small" aria-label="主导航">' +
  '<a href="/" class="' + (active === 'home' ? '' : 'muted') + '">概览</a>' +
  '<a href="/account" class="' + (active === 'account' ? '' : 'muted') + '">我的账户</a>' +
  '<a href="/admin" class="' + (active === 'admin' ? '' : 'muted') + '">管理</a>' +
  '</nav><div class="spacer"></div><span class="muted small who">' + esc(user) + '</span>' + themeButton +
  '<form method="post" action="/api/v1/auth/logout" style="margin:0"><button class="btn ghost sm" type="submit">退出</button></form></header>'

const card = (title: string, body: string, extra = ''): string =>
  '<section class="card"><h2>' + title + (extra ? '<span class="muted small">' + extra + '</span>' : '') + '</h2>' + body + '</section>'

const table = (headers: string[], bodyId: string, empty: string): string =>
  '<div class="table-wrap"><table class="table"><thead><tr>' +
  headers.map(h => '<th scope="col">' + h + '</th>').join('') +
  '</tr></thead><tbody id="' + bodyId + '"><tr><td colspan="' + headers.length + '" class="muted">' + empty + '</td></tr></tbody></table></div>'

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
    (error ? '<div class="alert err" role="alert" style="margin-top:14px">' + esc(error) + '</div>' : '') + '</section></div></main>')
}

export function loginPage(oidcEnabled: boolean, error?: string, background?: string): string {
  return shell('登录', '<main class="hero" id="main"><div class="auth">' +
    '<section class="pitch" aria-hidden="true"><div class="brand" style="margin-bottom:18px"><span class="dot"></span>DSH Remote</div>' +
    '<p class="lead">你的 Harness，<br>在哪儿都能用</p>' +
    '<p class="muted">登录后即可管理账号、设备与在线主机。所有业务流量端到端加密，服务器只转发密文。</p></section>' +
    '<section class="panel"><div class="row" style="justify-content:space-between"><h1 style="font-size:22px">登录</h1>' + themeButton + '</div>' +
    '<form method="post" action="/api/v1/auth/login" class="stack" style="margin-top:18px">' +
    '<div><label class="label" for="login-user">邮箱</label><input class="input" id="login-user" name="username" type="email" autocomplete="username" required placeholder="you@example.com"></div>' +
    '<div><label class="label" for="login-pass">密码</label><input class="input" id="login-pass" name="password" type="password" autocomplete="current-password" required placeholder="••••••••"></div>' +
    '<button class="btn block" type="submit">登录</button></form>' +
    (oidcEnabled ? '<div class="divider"></div><a class="btn ghost block" href="/api/v1/auth/oidc/start">使用 SSO 登录</a>' : '') +
    '<p class="small muted" style="margin:16px 0 0"><a href="/register">注册</a> · <a href="/forgot">忘记密码</a></p>' +
    (error ? '<div class="alert err" role="alert" style="margin-top:14px">' + esc(error) + '</div>' : '') + '</section></div></main>', background)
}

export function registerPage(onlySso: boolean, background?: string): string {
  if (onlySso) {
    return shell('注册', '<main class="hero" id="main"><section class="panel" style="max-width:460px;text-align:center">' +
      '<h1 style="font-size:22px">注册已关闭</h1><p class="muted">本站已启用仅 SSO，账号由身份提供方创建。</p>' +
      '<a class="btn ghost" href="/login">返回登录</a></section></main>', background)
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
    '<script>document.getElementById("reg-send").onclick=function(){var e=document.getElementById("reg-email").value.trim();' +
    'dshPost("/api/v1/auth/register/start",{email:e}).then(function(r){dshToast(r.status===202?"验证码已发送":dshErr(r.body.error&&r.body.error.code,r.status),r.status===202?"ok":"err")})};' +
    'document.getElementById("reg").onsubmit=function(ev){ev.preventDefault();var f=ev.target;' +
    'dshPost("/api/v1/auth/register/complete",{email:f.email.value.trim(),code:f.code.value.trim(),password:f.password.value}).then(function(r){' +
    'if(r.ok)location.href="/";else dshToast(dshErr(r.body.error&&r.body.error.code,r.status),"err")})}</script>', background)
}

export function forgotPage(onlySso: boolean, background?: string): string {
  if (onlySso) {
    return shell('找回密码', '<main class="hero" id="main"><section class="panel" style="max-width:460px;text-align:center">' +
      '<h1 style="font-size:22px">找回密码已禁用</h1><p class="muted">仅 SSO 模式下请通过身份提供方登录。</p>' +
      '<a class="btn ghost" href="/login">返回登录</a></section></main>', background)
  }
  return shell('找回密码', '<main class="hero" id="main"><section class="panel" style="max-width:520px">' +
    '<h1 style="font-size:22px;margin-bottom:6px">重置密码</h1><p class="muted small" style="margin:0 0 18px">验证码会发送到你的邮箱。</p>' +
    '<form id="fg" method="post" action="/api/v1/auth/password/reset/complete" class="stack">' +
    '<div><label class="label" for="fg-email">邮箱</label><input class="input" id="fg-email" name="email" type="email" required placeholder="you@example.com" autocomplete="email"></div>' +
    '<div class="row" style="align-items:flex-end"><div style="flex:1"><label class="label" for="fg-code">验证码</label><input class="input" id="fg-code" name="code" inputmode="numeric" maxlength="6" required></div><button class="btn ghost" type="button" id="fg-send">发送验证码</button></div>' +
    '<div><label class="label" for="fg-pass">新密码</label><input class="input" id="fg-pass" name="password" type="password" required minlength="12" placeholder="至少 12 位" autocomplete="new-password"></div>' +
    '<button class="btn block" type="submit">重置密码</button></form>' +
    '<p class="small muted" style="margin-top:16px"><a href="/login">返回登录</a></p></section></main>' +
    '<script>document.getElementById("fg-send").onclick=function(){var e=document.getElementById("fg-email").value.trim();' +
    'dshPost("/api/v1/auth/password/reset/start",{email:e}).then(function(r){dshToast(r.status===202?"验证码已发送":dshErr(r.body.error&&r.body.error.code,r.status),r.status===202?"ok":"err")})};' +
    'document.getElementById("fg").onsubmit=function(ev){ev.preventDefault();var f=ev.target;' +
    'dshPost("/api/v1/auth/password/reset/complete",{email:f.email.value.trim(),code:f.code.value.trim(),password:f.password.value}).then(function(r){' +
    'if(r.ok)dshToast("已重置，请返回登录","ok");else dshToast(dshErr(r.body.error&&r.body.error.code,r.status),"err")})}</script>', background)
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
    '<script>var ticket=new URLSearchParams(location.search).get("ticket");' +
    'var mode=document.getElementById("bind-mode");function sync(){var c=mode.value==="code";document.getElementById("bind-cd").style.display=c?"":"none";document.getElementById("bind-pw").style.display=c?"none":""}mode.onchange=sync;sync();' +
    'document.getElementById("bind-send").onclick=function(){dshPost("/api/v1/auth/oidc/bind/start",{ticket:ticket}).then(function(r){dshToast(r.status===202?"验证码已发送":dshErr(r.body.error&&r.body.error.code,r.status),r.status===202?"ok":"err")})};' +
    'document.getElementById("bind-submit").onclick=function(){var b={ticket:ticket,mode:mode.value};' +
    'if(mode.value==="code")b.code=document.getElementById("bind-code").value.trim();else b.password=document.getElementById("bind-pass").value;' +
    'dshPost("/api/v1/auth/oidc/bind/complete",b).then(function(r){if(r.ok)location.href="/";else dshToast(dshErr(r.body.error&&r.body.error.code,r.status),"err")})}</script>', background)
}

export function homePage(username: string, role: string): string {
  return shell('概览', topbar(username, 'home') + '<main class="wrap" id="main">' +
    '<div class="grid-phi"><div>' +
    '<section class="card"><h1 style="font-size:26px">你好，' + esc(username) + '</h1>' +
    '<p class="muted" style="margin:10px 0 0">从这里管理账户、设备与这台服务器。业务流量端到端加密，服务器只转发密文。</p></section>' +
    '<div class="stats" style="margin-top:var(--s3)">' +
    '<div class="stat"><div class="muted small">当前角色</div><div class="n">' + esc(role) + '</div></div>' +
    '<div class="stat"><div class="muted small">已登记设备</div><div class="n" id="deviceCount">—</div></div>' +
    '<div class="stat"><div class="muted small">服务状态</div><div class="n" id="health">—</div></div></div>' +
    '</div><aside>' + card('快捷入口', '<div class="stack">' +
      '<a class="btn ghost block" href="/account">账户与安全</a>' +
      (role === 'admin' ? '<a class="btn ghost block" href="/admin">用户与设备管理</a>' : '') +
      '</div>') + '</aside></div></main>' +
    '<script>fetch("/api/v1/account/devices").then(function(r){return r.json()}).then(function(d){document.getElementById("deviceCount").textContent=(d.items||[]).length}).catch(function(){});' +
    'fetch("/ready").then(function(r){document.getElementById("health").textContent=r.ok?"在线":"异常"}).catch(function(){document.getElementById("health").textContent="异常"});</script>')
}

export function accountPage(username: string, email: string, oidcBound: boolean, onlySso: boolean, background?: string): string {
  const passwordCard = onlySso
    ? card('修改密码', '<p class="muted small" style="margin:0">仅 SSO 模式已启用，密码修改不可用。</p>')
    : card('修改密码', '<div class="stack">' +
        '<div><label class="label" for="cur-pass">当前密码</label><input class="input" id="cur-pass" type="password" autocomplete="current-password"></div>' +
        '<div><label class="label" for="new-pass">新密码</label><input class="input" id="new-pass" type="password" placeholder="至少 12 位" autocomplete="new-password"></div>' +
        '<button class="btn" type="button" id="change-pw">保存</button></div>')
  return shell('我的账户', topbar(username, 'account') + '<main class="wrap" id="main"><div class="grid-phi"><div>' +
    card('账户', '<div class="grid-2">' +
      '<div><div class="label">邮箱</div><div class="mono">' + esc(email || '未设置') + '</div></div>' +
      '<div><div class="label">邮箱状态</div><div><span class="badge">' + (email ? '已验证' : '未设置') + '</span></div></div></div>') +
    card('换绑邮箱', '<div class="stack">' +
      '<div><label class="label" for="new-email">新邮箱</label><input class="input" id="new-email" type="email" placeholder="new@example.com" autocomplete="email"></div>' +
      '<div><button class="btn ghost" type="button" id="send-code">发送验证码</button></div>' +
      '<div class="grid-2"><div><label class="label" for="new-code">新邮箱验证码</label><input class="input" id="new-code" maxlength="6" inputmode="numeric"></div>' +
      '<div><label class="label" for="old-code">原邮箱验证码</label><input class="input" id="old-code" maxlength="6" inputmode="numeric"></div></div>' +
      '<button class="btn" type="button" id="change-email">确认换绑</button></div>') +
    passwordCard + '</div><aside>' +
    card('单点登录', '<p class="muted small" style="margin:0 0 12px">' + (oidcBound ? '已绑定 OIDC 身份。' : '尚未绑定 OIDC 身份。') + '</p>' +
      '<div class="stack"><a class="btn ghost block" href="/api/v1/auth/oidc/start">绑定 / 重新绑定</a>' +
      (onlySso ? '' : '<button class="btn danger block" type="button" id="unbind">解绑</button>') + '</div>') +
    card('提示', '<p class="muted small" style="margin:0">设备登录使用「设备用户名 + 设备密钥」，与网页密码相互独立。设备密钥可在管理员后台生成与吊销。</p>') +
    '</aside></div></main>' +
    '<script>' +
    'document.getElementById("change-pw").onclick=function(){dshPost("/api/v1/auth/password/change",{currentPassword:document.getElementById("cur-pass").value,newPassword:document.getElementById("new-pass").value}).then(function(r){dshToast(r.ok?"密码已修改":dshErr(r.body.error&&r.body.error.code,r.status),r.ok?"ok":"err")})};' +
    'document.getElementById("send-code").onclick=function(){dshPost("/api/v1/auth/email/change/start",{newEmail:document.getElementById("new-email").value.trim()}).then(function(r){dshToast(r.status===202?"验证码已发送":dshErr(r.body.error&&r.body.error.code,r.status),r.status===202?"ok":"err")})};' +
    'document.getElementById("change-email").onclick=function(){dshPost("/api/v1/auth/email/change/complete",{newEmail:document.getElementById("new-email").value.trim(),newCode:document.getElementById("new-code").value.trim(),oldCode:document.getElementById("old-code").value.trim()}).then(function(r){if(r.ok){dshToast("邮箱已换绑","ok");setTimeout(function(){location.reload()},800)}else dshToast(dshErr(r.body.error&&r.body.error.code,r.status),"err")})};' +
    'var ub=document.getElementById("unbind");if(ub)ub.onclick=function(){if(!confirm("解绑后将无法用该 SSO 身份登录，确定吗？"))return;dshPost("/api/v1/auth/oidc/unbind").then(function(r){dshToast(r.ok?"已解绑":dshErr(r.body.error&&r.body.error.code,r.status),r.ok?"ok":"err")})};' +
    '</script>', background)
}

export function adminPage(username: string, background?: string): string {
  return shell('管理', topbar(username, 'admin') + '<main class="wrap" id="main"><div class="grid-phi"><div>' +
    card('用户', table(['邮箱 / 用户名', '设备用户名', '角色', '密钥', '操作'], 'rows', '还没有用户') +
      '<div class="divider"></div><div class="grid-2">' +
      '<div><label class="label" for="nu">新建邮箱</label><input class="input" id="nu" type="email" placeholder="user@example.com" autocomplete="off"></div>' +
      '<div><label class="label" for="np">初始密码（可留空）</label><input class="input" id="np" type="password" autocomplete="new-password"></div></div>' +
      '<div class="row" style="margin-top:12px"><div style="min-width:140px"><label class="label" for="nr">角色</label><select class="input" id="nr"><option value="user">user</option><option value="admin">admin</option></select></div>' +
      '<button class="btn" type="button" id="create-user">创建用户</button></div>', '共 <span id="userCount">0</span> 人') +
    card('设备密钥 <span class="badge" id="keyOwner">未选择用户</span>', table(['标签', '设备数', '状态', '操作'], 'keys', '先在用户行点「密钥」选择用户') +
      '<div class="row" style="margin-top:12px"><div style="flex:1;min-width:200px"><label class="label" for="key-label">密钥标签</label><input class="input" id="key-label" placeholder="例如 客厅 iPad" maxlength="64"></div>' +
      '<button class="btn ghost" type="button" id="create-key">生成密钥</button></div>') +
    card('设备', table(['用户', '设备', '角色', '状态', '操作'], 'devices', '还没有设备接入')) +
    card('最近审计', table(['时间', '操作者', '动作'], 'audit', '暂无审计记录')) +
    '</div><aside>' +
    card('服务地址', '<div class="stack">' +
      '<div><label class="label" for="public-url">公网地址</label><input class="input" id="public-url" placeholder="https://remote.example.com"><span class="small muted">仅 https，留空则按请求推导</span></div>' +
      '<div><label class="label" for="trusted-proxies">额外可信代理</label><input class="input" id="trusted-proxies" placeholder="203.0.113.7, 2001:db8::2"><span class="small muted">内网与回环默认信任</span></div>' +
      '<button class="btn ghost" type="button" id="save-server">保存</button></div>') +
    card('外观', '<div class="stack"><div><label class="label" for="bg-url">登录页背景</label><input class="input" id="bg-url" placeholder="https://t.hinswu.top/pixiv"></div>' +
      '<button class="btn ghost" type="button" id="save-ui">保存</button></div>') +
    card('OIDC', '<div class="stack">' +
      '<label class="row small" for="oidc-enabled"><input type="checkbox" id="oidc-enabled" style="width:auto"> 启用 OIDC</label>' +
      '<label class="row small" for="only-sso"><input type="checkbox" id="only-sso" style="width:auto"> 仅允许 SSO</label>' +
      '<label class="row small" for="bind-require"><input type="checkbox" id="bind-require" style="width:auto"> 绑定已有账户需二次校验</label>' +
      '<div><label class="label" for="issuer">Issuer</label><input class="input" id="issuer" placeholder="https://idp.example.com"></div>' +
      '<div><label class="label" for="client-id">Client ID</label><input class="input" id="client-id"></div>' +
      '<div><label class="label" for="client-secret">Client Secret（留空不修改）</label><input class="input" id="client-secret" type="password" autocomplete="new-password"></div>' +
      '<div><label class="label" for="scopes">Scopes</label><input class="input" id="scopes" value="openid email profile"></div>' +
      '<div><label class="label" for="allowed-domains">允许邮箱域</label><input class="input" id="allowed-domains" placeholder="example.com"></div>' +
      '<button class="btn ghost" type="button" id="save-oidc">保存 OIDC</button></div>') +
    card('SMTP', '<div class="stack">' +
      '<div class="grid-2"><div><label class="label" for="smtp-host">Host</label><input class="input" id="smtp-host"></div><div><label class="label" for="smtp-port">Port</label><input class="input" id="smtp-port" type="number" value="587"></div></div>' +
      '<label class="row small" for="smtp-secure"><input type="checkbox" id="smtp-secure" style="width:auto"> 直接 TLS（465）</label>' +
      '<div class="grid-2"><div><label class="label" for="smtp-user">用户名</label><input class="input" id="smtp-user"></div><div><label class="label" for="smtp-pass">密码（留空不修改）</label><input class="input" id="smtp-pass" type="password" autocomplete="new-password"></div></div>' +
      '<div><label class="label" for="smtp-from">发件人</label><input class="input" id="smtp-from"></div>' +
      '<div class="row"><button class="btn ghost" type="button" id="save-smtp">保存</button><button class="btn ghost" type="button" id="test-smtp">发送测试</button>' +
      '<input class="input" id="smtp-test-to" aria-label="测试收件人" placeholder="test@example.com" style="max-width:220px"></div></div>') +
    card('限额与 ICE', '<div class="stack">' +
      '<div class="grid-2"><div><label class="label" for="session-ttl">会话 TTL(ms)</label><input class="input" id="session-ttl" type="number"></div>' +
      '<div><label class="label" for="conn-limit">并发连接</label><input class="input" id="conn-limit" type="number"></div>' +
      '<div><label class="label" for="user-rate">用户/分钟</label><input class="input" id="user-rate" type="number"></div>' +
      '<div><label class="label" for="anon-rate">匿名/分钟</label><input class="input" id="anon-rate" type="number"></div></div>' +
      '<div><label class="label" for="stun">STUN</label><input class="input" id="stun"></div>' +
      '<div><label class="label" for="turn">TURN</label><input class="input" id="turn"></div>' +
      '<div class="grid-2"><div><label class="label" for="turn-user">TURN 用户名</label><input class="input" id="turn-user"></div><div><label class="label" for="turn-pass">TURN 密码</label><input class="input" id="turn-pass" type="password" autocomplete="new-password"></div></div>' +
      '<button class="btn ghost" type="button" id="save-limits">保存</button></div>') +
    '</aside></div></main>' + keyDialog +
    '<script>' +
    'var currentUser=null;' +
    'function emptyRow(n,t){return \'<tr><td colspan="\'+n+\'" class="muted">\'+t+\'</td></tr>\'}' +
    'function loadUsers(){return dshApi("/api/v1/admin/users").then(function(r){var rows=r.body.users||[];document.getElementById("userCount").textContent=rows.length;' +
    'document.getElementById("rows").innerHTML=rows.length?rows.map(function(u){var name=dshEsc(u.username);return \'<tr><td>\'+name+\'</td><td class="mono small">\'+dshEsc(u.deviceUsername||"-")+\'</td><td>\'+dshEsc(u.role)+\'</td><td>\'+u.deviceKeys+\'</td><td><div class="actions">\'+' +
    '\'<button class="btn ghost sm" data-a="pick" data-id="\'+dshEsc(u.id)+\'" data-name="\'+dshEsc(u.deviceUsername||u.username)+\'" aria-label="查看 \'+name+\' 的设备密钥">密钥</button>\'+' +
    '\'<button class="btn ghost sm" data-a="toggle" data-id="\'+dshEsc(u.id)+\'" aria-label="\'+(u.disabled?"启用":"禁用")+\' \'+name+\'">\'+(u.disabled?"启用":"禁用")+\'</button>\'+' +
    '\'<button class="btn danger sm" data-a="del" data-id="\'+dshEsc(u.id)+\'" data-name="\'+name+\'" aria-label="删除 \'+name+\'">删除</button></div></td></tr>\'}).join(""):emptyRow(5,"还没有用户")})}' +
    'function loadKeys(){var t=document.getElementById("keys");if(!currentUser){t.innerHTML=emptyRow(4,"先在用户行点「密钥」选择用户");return}' +
    'dshApi("/api/v1/admin/users/"+encodeURIComponent(currentUser.id)+"/device-keys").then(function(r){var ks=r.body.keys||[];' +
    't.innerHTML=ks.length?ks.map(function(k){return \'<tr><td>\'+dshEsc(k.label)+\'</td><td><span class="badge">\'+k.deviceCount+\'</span></td><td>\'+(k.revoked?\'<span class="badge off">已吊销</span>\':\'<span class="badge ok">正常</span>\')+\'</td><td>\'+(k.revoked||k.id==="unbound"?"":\'<button class="btn danger sm" data-a="revoke" data-id="\'+dshEsc(k.id)+\'" aria-label="吊销密钥 \'+dshEsc(k.label)+\'">吊销</button>\')+\'</td></tr>\'}).join(""):emptyRow(4,"该用户还没有密钥")})}' +
    'function loadDevices(){dshApi("/api/v1/admin/devices").then(function(r){var xs=r.body.items||[];' +
    'document.getElementById("devices").innerHTML=xs.length?xs.map(function(x){return \'<tr><td>\'+dshEsc(x.username)+\'</td><td>\'+dshEsc(x.name)+\'</td><td>\'+dshEsc(x.role)+\'</td><td>\'+(x.revoked?\'<span class="badge off">已吊销</span>\':(x.online?\'<span class="badge ok">在线</span>\':\'<span class="badge">离线</span>\'))+\'</td><td>\'+(x.revoked?"":\'<button class="btn danger sm" data-a="revoke-device" data-id="\'+dshEsc(x.deviceId)+\'" data-name="\'+dshEsc(x.name)+\'">吊销</button>\')+\'</td></tr>\'}).join(""):emptyRow(5,"还没有设备接入")})}' +
    'function loadAudit(){dshApi("/api/v1/admin/audit?limit=20").then(function(r){var xs=r.body.items||[];' +
    'document.getElementById("audit").innerHTML=xs.length?xs.map(function(x){return \'<tr><td class="muted small">\'+dshEsc(new Date(x.at).toLocaleString())+\'</td><td>\'+dshEsc(x.actor||"-")+\'</td><td>\'+dshEsc(x.action)+\'</td></tr>\'}).join(""):emptyRow(3,"暂无审计记录")})}' +
    'function loadSettings(){dshApi("/api/v1/admin/settings").then(function(r){var b=r.body,o=b.oidc||{},l=b.limits||{},i=b.ice||{},s=b.smtp||{},sv=b.server||{},ui=b.ui||{};' +
    '$("public-url").value=sv.publicUrl||"";$("trusted-proxies").value=(sv.trustedProxyIps||[]).join(",");$("bg-url").value=ui.backgroundUrl||"";' +
    '$("oidc-enabled").checked=!!o.enabled;$("only-sso").checked=!!o.onlySso;$("bind-require").checked=o.bindRequireVerification!==false;$("issuer").value=o.issuer||"";$("client-id").value=o.clientId||"";$("scopes").value=o.scopes||"openid email profile";$("allowed-domains").value=(o.allowedDomains||[]).join(",");' +
    '$("session-ttl").value=l.sessionTtlMs||"";$("conn-limit").value=l.userConnectionLimit||"";$("user-rate").value=l.userRatePerMinute||"";$("anon-rate").value=l.anonRatePerMinute||"";' +
    '$("stun").value=(i.stunUrls||[]).join(",");$("turn").value=(i.turnUrls||[]).join(",");$("turn-user").value=i.turnUsername||"";' +
    '$("smtp-host").value=s.host||"";$("smtp-port").value=s.port||587;$("smtp-secure").checked=!!s.secure;$("smtp-user").value=s.user||"";$("smtp-from").value=s.from||""})}' +
    'function $(id){return document.getElementById(id)}' +
    'document.addEventListener("click",function(e){var b=e.target.closest?e.target.closest("button[data-a]"):null;if(!b)return;var id=b.getAttribute("data-id"),a=b.getAttribute("data-a");' +
    'if(a==="pick"){currentUser={id:id,deviceUsername:b.getAttribute("data-name")};$("keyOwner").textContent=currentUser.deviceUsername;loadKeys()}' +
    'else if(a==="toggle"){dshApi("/api/v1/admin/users/"+encodeURIComponent(id),{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({toggle:true})}).then(loadUsers)}' +
    'else if(a==="del"){if(!confirm("删除用户 "+b.getAttribute("data-name")+"？该用户的设备与会话会立即失效，且不可恢复。"))return;dshDel("/api/v1/admin/users/"+encodeURIComponent(id)).then(function(r){dshToast(r.ok?"已删除":dshErr(r.body.error&&r.body.error.code,r.status),r.ok?"ok":"err");loadUsers()})}' +
    'else if(a==="revoke"){if(!confirm("吊销这把密钥？用它注册的设备会立即掉线，且无法用同一设备 ID 重新接入。"))return;dshDel("/api/v1/admin/device-keys/"+encodeURIComponent(id)).then(function(r){dshToast(r.ok?"已吊销":dshErr(r.body.error&&r.body.error.code,r.status),r.ok?"ok":"err");loadKeys();loadUsers()})}' +
    'else if(a==="revoke-device"){if(!confirm("吊销设备 "+b.getAttribute("data-name")+"？它会立即断开。"))return;dshDel("/api/v1/admin/devices/"+encodeURIComponent(id)).then(function(r){dshToast(r.ok?"已吊销":dshErr(r.body.error&&r.body.error.code,r.status),r.ok?"ok":"err");loadDevices()})}});' +
    'function showKey(key){$("keyvalue").textContent=key;var d=$("keydlg");d.showModal();$("keycopy").onclick=function(){dshCopy(key)};$("keydone").onclick=function(){d.close()}}' +
    '$("create-user").onclick=function(){dshPost("/api/v1/admin/users",{username:$("nu").value.trim(),password:$("np").value||undefined,role:$("nr").value}).then(function(r){' +
    'if(r.ok){dshToast("用户已创建","ok");if(r.body.deviceKey)showKey(r.body.deviceKey);$("nu").value="";$("np").value="";loadUsers()}else dshToast(dshErr(r.body.error&&r.body.error.code,r.status),"err")})};' +
    '$("create-key").onclick=function(){if(!currentUser)return dshToast("先在用户行点「密钥」选择用户","err");' +
    'dshPost("/api/v1/admin/users/"+encodeURIComponent(currentUser.id)+"/device-keys",{label:$("key-label").value.trim()||"device"}).then(function(r){' +
    'if(r.ok){showKey(r.body.key);$("key-label").value="";loadKeys();loadUsers()}else dshToast(dshErr(r.body.error&&r.body.error.code,r.status),"err")})};' +
    '$("save-server").onclick=function(){dshPut("/api/v1/admin/settings",{server:{publicUrl:$("public-url").value.trim(),trustedProxyIps:$("trusted-proxies").value}}).then(function(r){dshToast(r.ok?"已保存":dshErr(r.body.error&&r.body.error.code,r.status),r.ok?"ok":"err")})};' +
    '$("save-ui").onclick=function(){dshPut("/api/v1/admin/settings",{ui:{backgroundUrl:$("bg-url").value.trim()}}).then(function(r){dshToast(r.ok?"已保存，刷新可见":dshErr(r.body.error&&r.body.error.code,r.status),r.ok?"ok":"err")})};' +
    '$("save-oidc").onclick=function(){dshPut("/api/v1/admin/settings",{oidc:{enabled:$("oidc-enabled").checked,onlySso:$("only-sso").checked,bindRequireVerification:$("bind-require").checked,issuer:$("issuer").value.trim(),clientId:$("client-id").value.trim(),clientSecret:$("client-secret").value,scopes:$("scopes").value,allowedDomains:$("allowed-domains").value}}).then(function(r){if(r.ok){$("client-secret").value="";dshToast("已保存","ok")}else dshToast(dshErr(r.body.error&&r.body.error.code,r.status),"err")})};' +
    '$("save-smtp").onclick=function(){dshPut("/api/v1/admin/settings",{smtp:{host:$("smtp-host").value.trim(),port:+$("smtp-port").value,secure:$("smtp-secure").checked,user:$("smtp-user").value,pass:$("smtp-pass").value,from:$("smtp-from").value}}).then(function(r){if(r.ok){$("smtp-pass").value="";dshToast("已保存","ok")}else dshToast(dshErr(r.body.error&&r.body.error.code,r.status),"err")})};' +
    '$("test-smtp").onclick=function(){dshPost("/api/v1/admin/smtp/test",{to:$("smtp-test-to").value.trim()}).then(function(r){dshToast(r.ok?"测试邮件已发送":dshErr(r.body.error&&r.body.error.code,r.status),r.ok?"ok":"err")})};' +
    '$("save-limits").onclick=function(){dshPut("/api/v1/admin/settings",{limits:{sessionTtlMs:+$("session-ttl").value,userConnectionLimit:+$("conn-limit").value,userRatePerMinute:+$("user-rate").value,anonRatePerMinute:+$("anon-rate").value},ice:{stunUrls:$("stun").value,turnUrls:$("turn").value,turnUsername:$("turn-user").value,turnPassword:$("turn-pass").value}}).then(function(r){if(r.ok){$("turn-pass").value="";dshToast("已保存","ok")}else dshToast(dshErr(r.body.error&&r.body.error.code,r.status),"err")})};' +
    'loadUsers();loadKeys();loadDevices();loadAudit();loadSettings();' +
    '</script>', background)
}
