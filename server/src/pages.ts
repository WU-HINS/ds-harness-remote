// generated UI

const CSS = [
  ':root{--phi:1.618;--bg:#0a0d13;--surface:#111722;--surface2:#161e2c;--line:#22304a;--text:#e7eef8;--muted:#8d9bb1;--accent:#3f6fe0;--accent-deep:#3157c9;--accent2:#8fb0ff;--ok:#3fb950;--warn:#d29922;--danger:#f85149;--radius:16px;--r-sm:10px;--shadow:0 18px 50px rgba(0,0,0,.45);--ring:0 0 0 3px rgba(91,140,255,.25)}',
  '@media (prefers-color-scheme:light){:root{--bg:#f5f7fb;--surface:#fff;--surface2:#f0f3f9;--line:#dde3ee;--text:#101623;--muted:#5d6b82;--accent:#2f5cc4;--accent-deep:#24479c;--accent2:#2f5cc4;--shadow:0 12px 32px rgba(16,22,35,.10);--ring:0 0 0 3px rgba(64,110,255,.18)}}',
  '[data-theme=light]{--bg:#f5f7fb;--surface:#fff;--surface2:#f0f3f9;--line:#dde3ee;--text:#101623;--muted:#5d6b82;--accent:#2f5cc4;--accent-deep:#24479c;--accent2:#2f5cc4;--shadow:0 12px 32px rgba(16,22,35,.10)}',
  '[data-theme=dark]{--bg:#0a0d13;--surface:#111722;--surface2:#161e2c;--line:#22304a;--text:#e7eef8;--muted:#8d9bb1;--accent:#3f6fe0;--accent-deep:#3157c9;--accent2:#8fb0ff;--shadow:0 18px 50px rgba(0,0,0,.45)}',
  '*{box-sizing:border-box}',
  'html,body{height:100%}',
  'body{margin:0;font:15px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans SC",sans-serif;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased}',
  'body.has-bg{background-image:linear-gradient(180deg,rgba(6,9,14,.72),rgba(6,9,14,.92)),var(--bg-image);background-size:cover;background-attachment:fixed;background-position:center}',
  'a{color:var(--accent2);text-decoration:none}a:hover{text-decoration:underline}',
  'h1,h2,h3{margin:0;font-weight:650;letter-spacing:-.01em}h1{font-size:clamp(22px,2.2vw,30px)}h2{font-size:16px}h3{font-size:14px}',
  '.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}',
  '.muted{color:var(--muted)}.small{font-size:12.5px}',
  '.topbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:16px;padding:14px clamp(16px,3vw,40px);backdrop-filter:blur(14px);background:color-mix(in srgb,var(--bg) 72%,transparent);border-bottom:1px solid var(--line)}',
  '.brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:-.02em}',
  '.brand .dot{width:26px;height:26px;border-radius:9px;background:linear-gradient(135deg,var(--accent),#9d7bff);box-shadow:0 6px 18px rgba(91,140,255,.35)}',
  '.topbar .spacer{flex:1}',
  '.wrap{max-width:1180px;margin:0 auto;padding:clamp(18px,3vw,40px)}',
  '.grid-phi{display:grid;grid-template-columns:var(--phi)fr 1fr;gap:clamp(16px,2.4vw,28px);align-items:start}',
  '.grid-phi>*{min-width:0}',
  '@media (max-width:900px){.grid-phi{grid-template-columns:1fr}}',
  '.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:clamp(16px,2vw,24px);box-shadow:var(--shadow)}',
  '.card+.card{margin-top:18px}',
  '.card h2{display:flex;align-items:center;justify-content:space-between;padding-bottom:12px;margin-bottom:14px;border-bottom:1px solid var(--line)}',
  '.stack{display:flex;flex-direction:column;gap:14px}.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}',
  '.label{display:block;font-size:12.5px;font-weight:600;color:var(--muted);margin:0 0 6px;letter-spacing:.02em}',
  '.input,select,textarea{width:100%;padding:11px 13px;border-radius:var(--r-sm);border:1px solid var(--line);background:var(--surface2);color:var(--text);font:inherit;outline:none;transition:border-color .15s,box-shadow .15s}',
  '.input:focus,select:focus,textarea:focus{border-color:var(--accent);box-shadow:var(--ring)}',
  '.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:11px 18px;border-radius:var(--r-sm);border:1px solid transparent;background:linear-gradient(135deg,var(--accent),var(--accent-deep));color:#fff;font:inherit;font-weight:600;cursor:pointer;transition:transform .12s,filter .12s}',
  '.btn:hover{filter:brightness(1.07)}.btn:active{transform:translateY(1px)}',
  '.btn[disabled]{opacity:.55;cursor:not-allowed}',
  '.btn.ghost{background:transparent;border-color:var(--line);color:var(--text)}',
  '.btn.danger{background:transparent;border-color:color-mix(in srgb,var(--danger) 55%,transparent);color:var(--danger)}',
  '.btn.sm{padding:6px 11px;font-size:12.5px;border-radius:8px}',
  '.btn.block{width:100%}',
  '.table{width:100%;border-collapse:collapse;display:block;overflow-x:auto;white-space:nowrap}',
  '.table th{font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);text-align:left;padding:8px;border-bottom:1px solid var(--line)}',
  '.table td{padding:10px 8px;border-bottom:1px solid color-mix(in srgb,var(--line) 60%,transparent);font-size:13.5px}',
  '.table tr:last-child td{border-bottom:0}',
  '.badge{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:999px;font-size:11.5px;background:var(--surface2);border:1px solid var(--line);color:var(--muted)}',
  '.badge.ok{color:var(--ok);border-color:color-mix(in srgb,var(--ok) 40%,transparent)}',
  '.badge.off{color:var(--danger);border-color:color-mix(in srgb,var(--danger) 40%,transparent)}',
  '.alert{padding:11px 14px;border-radius:var(--r-sm);border:1px solid var(--line);background:var(--surface2);font-size:13.5px}',
  '.alert.err{border-color:color-mix(in srgb,var(--danger) 45%,transparent);color:var(--danger)}',
  '.alert.ok{border-color:color-mix(in srgb,var(--ok) 45%,transparent);color:var(--ok)}',
  '.hero{min-height:100dvh;display:grid;place-items:center;padding:28px}',
  '.auth{width:min(1040px,100%);display:grid;grid-template-columns:var(--phi)fr 1fr;gap:clamp(20px,4vw,56px);align-items:center}',
  '@media (max-width:860px){.auth{grid-template-columns:1fr}.auth .pitch{display:none}}',
  '.pitch h1{font-size:clamp(26px,3.4vw,40px);line-height:1.15}',
  '.pitch p{color:var(--muted);max-width:34ch}',
  '.panel{background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:clamp(22px,3vw,34px);box-shadow:var(--shadow)}',
  '.stat{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:18px}',
  '.stat .n{font-size:28px;font-weight:700;letter-spacing:-.02em}',
  '.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px}',
  '.toast{position:fixed;right:18px;bottom:18px;z-index:60;display:flex;flex-direction:column;gap:8px;max-width:min(420px,90vw)}',
  '.toast div{padding:11px 14px;border-radius:12px;border:1px solid var(--line);background:var(--surface);box-shadow:var(--shadow);font-size:13.5px}',
  '.toast .err{border-color:color-mix(in srgb,var(--danger) 45%,transparent);color:var(--danger)}',
  '.toast .ok{border-color:color-mix(in srgb,var(--ok) 45%,transparent);color:var(--ok)}',
  '.divider{height:1px;background:var(--line);margin:16px 0}',
  '.icon-btn{width:36px;height:36px;display:inline-grid;place-items:center;border-radius:10px;border:1px solid var(--line);background:var(--surface2);color:var(--text);cursor:pointer}',
  '.kbd{font-family:ui-monospace,monospace;font-size:12px;padding:2px 6px;border-radius:6px;background:var(--surface2);border:1px solid var(--line)}',
  '.code{font-family:ui-monospace,monospace;font-size:12.5px;word-break:break-all;background:var(--surface2);border:1px solid var(--line);border-radius:10px;padding:10px 12px}',
  '.grid-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}',
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
  '@media (prefers-reduced-motion:reduce){::view-transition-old(root),::view-transition-new(root),.card,body{animation:none!important;transition:none!important}}',
].join('');

const esc = (value: unknown): string => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
const attr = esc

const THEME = [
  '<script>',
  '(function(){try{var t=localStorage.getItem("dsh-theme");if(t)document.documentElement.dataset.theme=t}catch(e){}})();',
  'function toggleTheme(){var d=document.documentElement;var n=d.dataset.theme==="light"?"dark":"light";d.dataset.theme=n;try{localStorage.setItem("dsh-theme",n)}catch(e){}}',
  // Cross-document view transitions are native in Chromium; elsewhere fade out on navigation.
  'document.addEventListener("DOMContentLoaded",function(){',
  'window.addEventListener("pageshow",function(){document.body.classList.remove("leaving")});',
  'if("startViewTransition" in document)return;',
  'document.addEventListener("click",function(e){',
  'var a=e.target&&e.target.closest?e.target.closest("a"):null;',
  'if(!a||a.target||a.hasAttribute("download")||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||e.button!==0)return;',
  'var u=new URL(a.href,location.href);if(u.origin!==location.origin)return;',
  'e.preventDefault();document.body.classList.add("leaving");setTimeout(function(){location.href=u.href},170);',
  '});});',
  '</script>',
].join('')

const themeButton = '<button class="icon-btn" type="button" onclick="toggleTheme()" title="切换主题" aria-label="切换主题">◐</button>'

const bgStyle = (url?: string): string => (url && /^https:\/\/[A-Za-z0-9._~:/?#\[\]@!$&*+,=%-]+$/i.test(url))
  ? ' style="--bg-image:url(&quot;' + esc(url) + '&quot;)" class="has-bg"'
  : ''

const shell = (title: string, body: string, background?: string): string =>
  '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>' + esc(title) + ' · DSH Remote</title><style>' + CSS + '</style>' + THEME +
  '</head><body' + bgStyle(background) + '>' + body + '</body></html>'

const topbar = (user: string, active: string): string =>
  '<header class="topbar"><div class="brand"><span class="dot"></span>DSH Remote</div>' +
  '<nav class="row small">' +
  '<a href="/" class="' + (active === 'home' ? '' : 'muted') + '">概览</a>' +
  '<a href="/account" class="' + (active === 'account' ? '' : 'muted') + '">我的账户</a>' +
  '<a href="/admin" class="' + (active === 'admin' ? '' : 'muted') + '">管理</a>' +
  '</nav><div class="spacer"></div><span class="muted small">' + esc(user) + '</span>' + themeButton +
  '<form method="post" action="/api/v1/auth/logout" style="margin:0"><button class="btn ghost sm" type="submit">退出</button></form></header>'

const card = (title: string, body: string, extra = ''): string =>
  '<section class="card"><h2>' + title + (extra ? '<span class="muted small">' + extra + '</span>' : '') + '</h2>' + body + '</section>'

export function setupPage(setupKey: string, suggestedOrigin = '', error?: string): string {
  const key = setupKey.replace(/[^A-Za-z0-9_-]/g, '')
  return shell('初始化', '<main class="hero"><div class="auth">' +
    '<section class="pitch"><div class="brand" style="margin-bottom:18px"><span class="dot"></span>DSH Remote</div>' +
    '<h1>先把这台服务器<br>认领下来</h1>' +
    '<p class="muted">初始化只需要一次：一个管理员邮箱、一个一次性密钥。完成后这台机器就归你管了。</p>' +
    '<div class="row small muted" style="margin-top:22px"><span class="kbd">1</span> 填写公网地址 <span class="kbd">2</span> 创建管理员 <span class="kbd">3</span> 开始使用</div></section>' +
    '<section class="panel"><h1 style="font-size:22px;margin-bottom:6px">初始化服务器</h1>' +
    '<p class="muted small" style="margin:0 0 20px">一次性密钥见服务端启动日志，也可由 DSH_SETUP_KEY 指定。</p>' +
    '<form method="post" action="/api/v1/setup" class="stack">' +
    '<div><label class="label">初始化密钥</label><input class="input mono" name="key" value="' + key + '" required></div>' +
    '<div><label class="label">公网地址</label><input class="input" name="publicUrl" type="url" placeholder="https://remote.example.com" value="' + attr(suggestedOrigin.startsWith('https://') ? suggestedOrigin : '') + '"><span class="small muted">仅 https，可稍后在后台修改</span></div>' +
    '<div><label class="label">管理员邮箱</label><input class="input" name="username" type="email" required placeholder="you@example.com"><span class="small muted">必须使用邮箱，作为登录账号</span></div>' +
    '<div><label class="label">密码</label><input class="input" name="password" type="password" required minlength="12" placeholder="至少 12 位"></div>' +
    '<button class="btn block" type="submit">创建管理员</button></form>' +
    (error ? '<div class="alert err" style="margin-top:14px">' + esc(error) + '</div>' : '') + '</section></div></main>')
}

export function loginPage(oidcEnabled: boolean, error?: string, background?: string): string {
  return shell('登录', '<main class="hero"><div class="auth">' +
    '<section class="pitch"><div class="brand" style="margin-bottom:18px"><span class="dot"></span>DSH Remote</div>' +
    '<h1>你的 Harness，<br>在哪儿都能用</h1>' +
    '<p class="muted">登录后即可管理账号、设备与在线主机。所有业务流量端到端加密，服务器只转发密文。</p></section>' +
    '<section class="panel"><div class="row" style="justify-content:space-between"><h1 style="font-size:22px">登录</h1>' + themeButton + '</div>' +
    '<form method="post" action="/api/v1/auth/login" class="stack" style="margin-top:18px">' +
    '<div><label class="label">邮箱</label><input class="input" name="username" type="email" autocomplete="username" required placeholder="you@example.com"></div>' +
    '<div><label class="label">密码</label><input class="input" name="password" type="password" autocomplete="current-password" required placeholder="••••••••"></div>' +
    '<button class="btn block" type="submit">登录</button></form>' +
    (oidcEnabled ? '<div class="divider"></div><a class="btn ghost block" href="/api/v1/auth/oidc/start">使用 SSO 登录</a>' : '') +
    '<p class="small muted" style="margin:16px 0 0"><a href="/register">注册</a> · <a href="/forgot">忘记密码</a></p>' +
    (error ? '<div class="alert err" style="margin-top:14px">' + esc(error) + '</div>' : '') + '</section></div></main>', background)
}

export function registerPage(onlySso: boolean, background?: string): string {
  if (onlySso) {
    return shell('注册', '<main class="hero"><section class="panel" style="max-width:460px;text-align:center">' +
      '<h1 style="font-size:22px">注册已关闭</h1><p class="muted">本站已启用仅 SSO，账号由身份提供方创建。</p>' +
      '<a class="btn ghost" href="/login">返回登录</a></section></main>', background)
  }
  return shell('注册', '<main class="hero"><section class="panel" style="max-width:520px">' +
    '<h1 style="font-size:22px;margin-bottom:6px">创建账户</h1><p class="muted small" style="margin:0 0 18px">需要邮箱验证码。</p>' +
    '<div class="stack">' +
    '<div><label class="label">邮箱</label><input class="input" id="email" type="email" placeholder="you@example.com"></div>' +
    '<div class="row" style="align-items:flex-end"><div style="flex:1"><label class="label">验证码</label><input class="input" id="code" inputmode="numeric" maxlength="6" placeholder="6 位数字"></div><button class="btn ghost" type="button" id="send">发送验证码</button></div>' +
    '<div><label class="label">密码</label><input class="input" id="password" type="password" placeholder="至少 12 位"></div>' +
    '<button class="btn block" type="button" id="submit">创建账户</button></div>' +
    '<p class="small muted" style="margin-top:16px"><a href="/login">返回登录</a></p>' +
    '<div id="out"></div></section></main>' +
    '<script>' +
    'const out=document.getElementById("out");const say=(c,m)=>{out.innerHTML="<div class=\"alert "+c+"\" style=\"margin-top:12px\">"+m+"</div>"};' +
    'const post=(p,b)=>fetch(p,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)});' +
    'document.getElementById("send").onclick=async()=>{const email=document.getElementById("email").value.trim();' +
    'const r=await post("/api/v1/auth/register/start",{email});say(r.status===202?"ok":"err",r.status===202?"验证码已发送":"发送失败（"+r.status+"）")};' +
    'document.getElementById("submit").onclick=async()=>{const email=document.getElementById("email").value.trim();' +
    'const code=document.getElementById("code").value.trim();const password=document.getElementById("password").value;' +
    'const r=await post("/api/v1/auth/register/complete",{email,code,password});' +
    'if(r.ok){location.href="/"}else{const d=await r.json();say("err",(d.error&&d.error.code)||("失败 "+r.status))}};' +
    '</script>', background)
}

export function forgotPage(onlySso: boolean, background?: string): string {
  if (onlySso) {
    return shell('找回密码', '<main class="hero"><section class="panel" style="max-width:460px;text-align:center">' +
      '<h1 style="font-size:22px">找回密码已禁用</h1><p class="muted">仅 SSO 模式下请通过身份提供方登录。</p>' +
      '<a class="btn ghost" href="/login">返回登录</a></section></main>', background)
  }
  return shell('找回密码', '<main class="hero"><section class="panel" style="max-width:520px">' +
    '<h1 style="font-size:22px;margin-bottom:6px">重置密码</h1><p class="muted small" style="margin:0 0 18px">验证码会发送到你的邮箱。</p>' +
    '<div class="stack">' +
    '<div><label class="label">邮箱</label><input class="input" id="email" type="email" placeholder="you@example.com"></div>' +
    '<div class="row" style="align-items:flex-end"><div style="flex:1"><label class="label">验证码</label><input class="input" id="code" inputmode="numeric" maxlength="6"></div><button class="btn ghost" type="button" id="send">发送验证码</button></div>' +
    '<div><label class="label">新密码</label><input class="input" id="password" type="password" placeholder="至少 12 位"></div>' +
    '<button class="btn block" type="button" id="submit">重置密码</button></div>' +
    '<p class="small muted" style="margin-top:16px"><a href="/login">返回登录</a></p><div id="out"></div></section></main>' +
    '<script>' +
    'const out=document.getElementById("out");const say=(c,m)=>{out.innerHTML="<div class=\"alert "+c+"\" style=\"margin-top:12px\">"+m+"</div>"};' +
    'const post=(p,b)=>fetch(p,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)});' +
    'document.getElementById("send").onclick=async()=>{const email=document.getElementById("email").value.trim();' +
    'const r=await post("/api/v1/auth/password/reset/start",{email});say(r.status===202?"ok":"err",r.status===202?"验证码已发送":"发送失败（"+r.status+"）")};' +
    'document.getElementById("submit").onclick=async()=>{const email=document.getElementById("email").value.trim();' +
    'const code=document.getElementById("code").value.trim();const password=document.getElementById("password").value;' +
    'const r=await post("/api/v1/auth/password/reset/complete",{email,code,password});' +
    'if(r.ok){say("ok","已重置，请返回登录")}else{const d=await r.json();say("err",(d.error&&d.error.code)||("失败 "+r.status))}};' +
    '</script>', background)
}

export function bindPage(email: string, onlySso: boolean, background?: string): string {
  return shell('绑定账户', '<main class="hero"><section class="panel" style="max-width:520px">' +
    '<h1 style="font-size:22px;margin-bottom:6px">绑定已有账户</h1>' +
    '<p class="muted small" style="margin:0 0 18px">邮箱 ' + esc(email) + ' 已注册但尚未绑定此 SSO 身份。</p>' +
    '<div class="stack">' +
    '<div><label class="label">验证方式</label><select class="input" id="mode">' +
    (onlySso ? '' : '<option value="password">账户密码</option>') + '<option value="code">邮箱验证码</option></select></div>' +
    '<div id="pw"' + (onlySso ? ' style="display:none"' : '') + '><label class="label">密码</label><input class="input" id="password" type="password"></div>' +
    '<div id="cd" style="display:none"><div class="row" style="align-items:flex-end"><div style="flex:1"><label class="label">验证码</label><input class="input" id="code" inputmode="numeric" maxlength="6"></div><button class="btn ghost" type="button" id="send">发送验证码</button></div></div>' +
    '<button class="btn block" type="button" id="submit">绑定并登录</button></div><div id="out"></div></section></main>' +
    '<script>' +
    'const ticket=new URLSearchParams(location.search).get("ticket");const out=document.getElementById("out");' +
    'const say=(c,m)=>{out.innerHTML="<div class=\"alert "+c+"\" style=\"margin-top:12px\">"+m+"</div>"};' +
    'const mode=document.getElementById("mode");const sync=()=>{const c=mode.value==="code";document.getElementById("cd").style.display=c?"":"none";document.getElementById("pw").style.display=c?"none":""};mode.onchange=sync;sync();' +
    'document.getElementById("send").onclick=async()=>{const r=await fetch("/api/v1/auth/oidc/bind/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket})});say(r.status===202?"ok":"err",r.status===202?"验证码已发送":"发送失败（"+r.status+"）")};' +
    'document.getElementById("submit").onclick=async()=>{const body={ticket,mode:mode.value};' +
    'if(mode.value==="code")body.code=document.getElementById("code").value.trim();else body.password=document.getElementById("password").value;' +
    'const r=await fetch("/api/v1/auth/oidc/bind/complete",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});' +
    'if(r.ok){location.href="/"}else{const d=await r.json();say("err",(d.error&&d.error.code)||("失败 "+r.status))}};' +
    '</script>', background)
}

export function homePage(username: string, role: string): string {
  return shell('概览', topbar(username, 'home') + '<div class="wrap">' +
    '<div class="grid-phi"><div>' +
    '<section class="card"><h1 style="font-size:26px">你好，' + esc(username) + '</h1>' +
    '<p class="muted" style="margin:10px 0 0">从这里管理账户、设备与这台服务器。业务流量端到端加密，服务器只转发密文。</p></section>' +
    '<div class="stats" style="margin-top:18px">' +
    '<div class="stat"><div class="muted small">当前角色</div><div class="n">' + esc(role) + '</div></div>' +
    '<div class="stat"><div class="muted small">已登记设备</div><div class="n" id="deviceCount">—</div></div>' +
    '<div class="stat"><div class="muted small">服务状态</div><div class="n" id="health">—</div></div></div>' +
    '</div>' +
    '<aside>' + card('快捷入口', '<div class="stack">' +
      '<a class="btn ghost block" href="/account">账户与安全</a>' +
      (role === 'admin' ? '<a class="btn ghost block" href="/admin">用户与设备管理</a>' : '') +
      '<a class="btn ghost block" href="/api/v1/auth/logout" onclick="event.preventDefault();fetch(\'/api/v1/auth/logout\',{method:\'POST\'}).then(()=>location.href=\'/login\')">退出登录</a>' +
      '</div>') + '</aside></div></div>' +
    '<script>' +
    'fetch("/api/v1/account/devices").then(r=>r.json()).then(d=>{document.getElementById("deviceCount").textContent=(d.items||[]).length}).catch(()=>{});' +
    'fetch("/ready").then(r=>{document.getElementById("health").textContent=r.ok?"在线":"异常"}).catch(()=>{document.getElementById("health").textContent="异常"});' +
    '</script>')
}

export function accountPage(username: string, email: string, oidcBound: boolean, onlySso: boolean, background?: string): string {
  const passwordCard = onlySso
    ? card('修改密码', '<p class="muted small" style="margin:0">仅 SSO 模式已启用，密码修改不可用。</p>')
    : card('修改密码', '<div class="stack">' +
        '<div><label class="label">当前密码</label><input class="input" id="currentPassword" type="password"></div>' +
        '<div><label class="label">新密码</label><input class="input" id="newPassword" type="password" placeholder="至少 12 位"></div>' +
        '<button class="btn" type="button" id="changePw">保存</button></div>')
  return shell('我的账户', topbar(username, 'account') + '<div class="wrap"><div class="grid-phi"><div>' +
    card('账户', '<div class="grid-2">' +
      '<div><div class="label">邮箱</div><div class="mono">' + esc(email || '未设置') + '</div></div>' +
      '<div><div class="label">角色</div><div>' + esc(username === '' ? '' : '') + '<span class="badge">' + (email ? '已验证' : '未设置邮箱') + '</span></div></div></div>') +
    card('换绑邮箱', '<div class="stack">' +
      '<div><label class="label">新邮箱</label><input class="input" id="newEmail" type="email" placeholder="new@example.com"></div>' +
      '<button class="btn ghost" type="button" id="sendEmailCode">发送验证码</button>' +
      '<div class="grid-2"><div><label class="label">新邮箱验证码</label><input class="input" id="newCode" maxlength="6"></div>' +
      '<div><label class="label">原邮箱验证码</label><input class="input" id="oldCode" maxlength="6"></div></div>' +
      '<button class="btn" type="button" id="changeEmail">确认换绑</button></div>') +
    passwordCard + '</div><aside>' +
    card('单点登录', '<p class="muted small" style="margin:0 0 12px">' + (oidcBound ? '已绑定 OIDC 身份。' : '尚未绑定 OIDC 身份。') + '</p>' +
      '<div class="stack"><a class="btn ghost block" href="/api/v1/auth/oidc/start">绑定 / 重新绑定</a>' +
      (onlySso ? '' : '<button class="btn danger block" type="button" id="unbind">解绑</button>') + '</div>') +
    card('提示', '<p class="muted small" style="margin:0">设备登录使用「设备用户名 + 设备密钥」，与网页密码相互独立。设备密钥可在管理员后台生成与吊销。</p>') +
    '</aside></div></div>' +
    '<script>' +
    'const toast=(m,c)=>{const t=document.createElement("div");t.className=c||"ok";t.textContent=m;' +
    'let box=document.querySelector(".toast");if(!box){box=document.createElement("div");box.className="toast";document.body.appendChild(box)}box.appendChild(t);setTimeout(()=>t.remove(),4000)};' +
    'const post=(p,b)=>fetch(p,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b||{})}).then(async r=>({ok:r.ok,status:r.status,body:await r.json().catch(()=>({}))}));' +
    'const pw=document.getElementById("changePw");if(pw)pw.onclick=async()=>{const r=await post("/api/v1/auth/password/change",{currentPassword:document.getElementById("currentPassword").value,newPassword:document.getElementById("newPassword").value});toast(r.ok?"密码已修改":"修改失败（"+r.status+"）",r.ok?"ok":"err")};' +
    'document.getElementById("sendEmailCode").onclick=async()=>{const r=await post("/api/v1/auth/email/change/start",{newEmail:document.getElementById("newEmail").value.trim()});toast(r.status===202?"验证码已发送":"发送失败（"+r.status+"）",r.status===202?"ok":"err")};' +
    'document.getElementById("changeEmail").onclick=async()=>{const r=await post("/api/v1/auth/email/change/complete",{newEmail:document.getElementById("newEmail").value.trim(),newCode:document.getElementById("newCode").value.trim(),oldCode:document.getElementById("oldCode").value.trim()});toast(r.ok?"邮箱已换绑":"换绑失败（"+r.status+"）",r.ok?"ok":"err");if(r.ok)setTimeout(()=>location.reload(),800)};' +
    'const ub=document.getElementById("unbind");if(ub)ub.onclick=async()=>{const r=await post("/api/v1/auth/oidc/unbind");toast(r.ok?"已解绑":"解绑失败（"+r.status+"）",r.ok?"ok":"err")};' +
    '</script>', background)
}

export function adminPage(username: string, background?: string): string {
  return shell('管理', topbar(username, 'admin') + '<div class="wrap"><div class="grid-phi"><div>' +
    card('用户', '<table class="table"><thead><tr><th>邮箱 / 用户名</th><th>设备用户名</th><th>角色</th><th>密钥</th><th></th></tr></thead><tbody id="rows"></tbody></table>' +
      '<div class="divider"></div><div class="grid-2">' +
      '<div><label class="label">新建邮箱</label><input class="input" id="nu" type="email" placeholder="user@example.com"></div>' +
      '<div><label class="label">初始密码（可留空）</label><input class="input" id="np" type="password"></div></div>' +
      '<div class="row" style="margin-top:12px"><select class="input" id="nr" style="max-width:160px"><option value="user">user</option><option value="admin">admin</option></select>' +
      '<button class="btn" type="button" id="createUser">创建用户</button></div>', '共 <span id="userCount">0</span> 人') +
    card('设备密钥 <span class="badge" id="keyOwner">未选择用户</span>', '<table class="table"><thead><tr><th>标签</th><th>设备数</th><th>状态</th><th></th></tr></thead><tbody id="keys"></tbody></table>' +
      '<div class="row" style="margin-top:12px"><input class="input" id="keyLabel" placeholder="标签，如 客厅 iPad" style="max-width:260px">' +
      '<button class="btn ghost" type="button" id="createKey">生成密钥</button></div>') +
    card('设备', '<table class="table"><thead><tr><th>用户</th><th>设备</th><th>角色</th><th>状态</th><th></th></tr></thead><tbody id="devices"></tbody></table>') +
    card('最近审计', '<table class="table"><thead><tr><th>时间</th><th>操作者</th><th>动作</th></tr></thead><tbody id="audit"></tbody></table>') +
    '</div><aside>' +
    card('服务地址', '<div class="stack">' +
      '<div><label class="label">公网地址</label><input class="input" id="publicUrl" placeholder="https://remote.example.com"><span class="small muted">仅 https，留空则按请求推导</span></div>' +
      '<div><label class="label">额外可信代理</label><input class="input" id="trustedProxyIps" placeholder="203.0.113.7, 2001:db8::2"><span class="small muted">内网与回环默认信任</span></div>' +
      '<button class="btn" type="button" id="saveServer">保存</button></div>') +
    card('外观', '<div class="stack"><div><label class="label">登录页背景</label><input class="input" id="backgroundUrl" placeholder="https://t.hinswu.top/pixiv"></div>' +
      '<button class="btn" type="button" id="saveUi">保存</button></div>') +
    card('OIDC', '<div class="stack">' +
      '<label class="row small"><input type="checkbox" id="oidcEnabled" style="width:auto"> 启用 OIDC</label>' +
      '<label class="row small"><input type="checkbox" id="onlySso" style="width:auto"> 仅允许 SSO</label>' +
      '<label class="row small"><input type="checkbox" id="bindRequire" style="width:auto"> 绑定已有账户需二次校验</label>' +
      '<div><label class="label">Issuer</label><input class="input" id="issuer" placeholder="https://idp.example.com"></div>' +
      '<div><label class="label">Client ID</label><input class="input" id="clientId"></div>' +
      '<div><label class="label">Client Secret（留空不修改）</label><input class="input" id="clientSecret" type="password"></div>' +
      '<div><label class="label">Scopes</label><input class="input" id="scopes" value="openid email profile"></div>' +
      '<div><label class="label">允许邮箱域</label><input class="input" id="allowedDomains" placeholder="example.com"></div>' +
      '<button class="btn" type="button" id="saveOidc">保存 OIDC</button></div>') +
    card('SMTP', '<div class="stack">' +
      '<div class="grid-2"><div><label class="label">Host</label><input class="input" id="smtpHost"></div><div><label class="label">Port</label><input class="input" id="smtpPort" type="number" value="587"></div></div>' +
      '<label class="row small"><input type="checkbox" id="smtpSecure" style="width:auto"> 直接 TLS（465）</label>' +
      '<div class="grid-2"><div><label class="label">用户名</label><input class="input" id="smtpUser"></div><div><label class="label">密码（留空不修改）</label><input class="input" id="smtpPass" type="password"></div></div>' +
      '<div><label class="label">发件人</label><input class="input" id="smtpFrom"></div>' +
      '<div class="row"><button class="btn" type="button" id="saveSmtp">保存</button><button class="btn ghost" type="button" id="testSmtp">发送测试</button>' +
      '<input class="input" id="smtpTestTo" placeholder="test@example.com" style="max-width:220px"></div></div>') +
    card('限额与 ICE', '<div class="stack">' +
      '<div class="grid-2"><div><label class="label">会话 TTL(ms)</label><input class="input" id="sessionTtl" type="number"></div>' +
      '<div><label class="label">并发连接</label><input class="input" id="connLimit" type="number"></div>' +
      '<div><label class="label">用户/分钟</label><input class="input" id="userRate" type="number"></div>' +
      '<div><label class="label">匿名/分钟</label><input class="input" id="anonRate" type="number"></div></div>' +
      '<div><label class="label">STUN</label><input class="input" id="stunUrls"></div>' +
      '<div><label class="label">TURN</label><input class="input" id="turnUrls"></div>' +
      '<div class="grid-2"><div><label class="label">TURN 用户名</label><input class="input" id="turnUser"></div><div><label class="label">TURN 密码</label><input class="input" id="turnPass" type="password"></div></div>' +
      '<button class="btn" type="button" id="saveLimits">保存</button></div>') +
    '</aside></div></div>' +
    '<script>' +
    'var currentUser=null;' +
    'const toast=(m,c)=>{const t=document.createElement("div");t.className=c||"ok";t.textContent=m;' +
    'let box=document.querySelector(".toast");if(!box){box=document.createElement("div");box.className="toast";document.body.appendChild(box)}box.appendChild(t);setTimeout(()=>t.remove(),4000)};' +
    'const api=async(p,o)=>{const r=await fetch(p,o);let b={};try{b=await r.json()}catch(e){};return{ok:r.ok,status:r.status,body:b}};' +
    'const put=(p,b)=>api(p,{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(b)});' +
    'const post=(p,b)=>api(p,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b||{})});' +
    'const del=(p)=>api(p,{method:"DELETE"});' +
    'async function loadUsers(){const d=await api("/api/v1/admin/users");const rows=d.body.users||[];document.getElementById("userCount").textContent=rows.length;' +
    'document.getElementById("rows").innerHTML=rows.map(u=>"<tr><td>"+u.username+"</td><td><span class=\"mono small\">"+(u.deviceUsername||"-")+"</span></td><td>"+u.role+"</td><td>"+u.deviceKeys+"</td>"+' +
    '"<td class=\"row\"><button class=\"btn ghost sm\" data-a=pick data-id="+u.id+" data-name=\""+(u.deviceUsername||u.username)+"\">密钥</button><button class=\"btn ghost sm\" data-a=toggle data-id="+u.id+">"+(u.disabled?"启用":"禁用")+"</button><button class=\"btn danger sm\" data-a=del data-id="+u.id+">删除</button></td></tr>").join("")}' +
    'async function loadKeys(){const t=document.getElementById("keys");if(!currentUser){t.innerHTML="";return}const d=await api("/api/v1/admin/users/"+currentUser.id+"/device-keys");' +
    't.innerHTML=(d.body.keys||[]).map(k=>"<tr><td>"+k.label+"</td><td><span class=\"badge\">"+k.deviceCount+"</span></td><td>"+(k.revoked?"<span class=\"badge off\">已吊销</span>":"<span class=\"badge ok\">正常</span>")+"</td>"+' +
    '"<td>"+(k.revoked||k.id==="unbound"?"":"<button class=\"btn danger sm\" data-a=revoke data-id="+k.id+">吊销</button>")+"</td></tr>").join("")}' +
    'async function loadDevices(){const d=await api("/api/v1/admin/devices");document.getElementById("devices").innerHTML=(d.body.items||[]).map(x=>"<tr><td>"+x.username+"</td><td>"+x.name+"</td><td>"+x.role+"</td><td>"+(x.revoked?"<span class=\"badge off\">已吊销</span>":(x.online?"<span class=\"badge ok\">在线</span>":"<span class=\"badge\">离线</span>"))+"</td>"+' +
    '"<td>"+(x.revoked?"":"<button class=\"btn danger sm\" data-a=revokeDevice data-id="+x.deviceId+">吊销</button>")+"</td></tr>").join("")}' +
    'async function loadAudit(){const d=await api("/api/v1/admin/audit?limit=20");document.getElementById("audit").innerHTML=(d.body.items||[]).map(x=>"<tr><td class=\"muted small\">"+new Date(x.at).toLocaleString()+"</td><td>"+(x.actor||"-")+"</td><td>"+x.action+"</td></tr>").join("")}' +
    'async function loadSettings(){const d=await api("/api/v1/admin/settings");const b=d.body;const o=b.oidc||{};const l=b.limits||{};const i=b.ice||{};const s=b.smtp||{};const sv=b.server||{};const ui=b.ui||{};' +
    'document.getElementById("publicUrl").value=sv.publicUrl||"";document.getElementById("trustedProxyIps").value=(sv.trustedProxyIps||[]).join(",");' +
    'document.getElementById("backgroundUrl").value=ui.backgroundUrl||"";' +
    'oidcEnabled.checked=!!o.enabled;onlySso.checked=!!o.onlySso;bindRequire.checked=o.bindRequireVerification!==false;issuer.value=o.issuer||"";clientId.value=o.clientId||"";scopes.value=o.scopes||"openid email profile";allowedDomains.value=(o.allowedDomains||[]).join(",");' +
    'sessionTtl.value=l.sessionTtlMs||"";connLimit.value=l.userConnectionLimit||"";userRate.value=l.userRatePerMinute||"";anonRate.value=l.anonRatePerMinute||"";' +
    'stunUrls.value=(i.stunUrls||[]).join(",");turnUrls.value=(i.turnUrls||[]).join(",");turnUser.value=i.turnUsername||"";' +
    'smtpHost.value=s.host||"";smtpPort.value=s.port||587;smtpSecure.checked=!!s.secure;smtpUser.value=s.user||"";smtpFrom.value=s.from||""}' +
    'document.addEventListener("click",async e=>{const b=e.target.closest("button[data-a]");if(!b)return;const id=b.dataset.id;const a=b.dataset.a;' +
    'if(a==="pick"){currentUser={id:id,deviceUsername:b.dataset.name};document.getElementById("keyOwner").textContent=b.dataset.name;loadKeys()}' +
    'else if(a==="toggle"){await api("/api/v1/admin/users/"+id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({toggle:true})});loadUsers()}' +
    'else if(a==="del"){await del("/api/v1/admin/users/"+id);loadUsers()}' +
    'else if(a==="revoke"){await del("/api/v1/admin/device-keys/"+id);loadKeys();loadUsers()}' +
    'else if(a==="revokeDevice"){await del("/api/v1/admin/devices/"+id);loadDevices()}});' +
    'document.getElementById("createUser").onclick=async()=>{const r=await post("/api/v1/admin/users",{username:document.getElementById("nu").value.trim(),password:document.getElementById("np").value||undefined,role:document.getElementById("nr").value});' +
    'toast(r.ok?"已创建":("创建失败："+((r.body.error&&r.body.error.code)||r.status)),r.ok?"ok":"err");if(r.ok){document.getElementById("nu").value="";document.getElementById("np").value="";loadUsers()}};' +
    'document.getElementById("createKey").onclick=async()=>{if(!currentUser)return toast("先选择一个用户","err");const r=await post("/api/v1/admin/users/"+currentUser.id+"/device-keys",{label:document.getElementById("keyLabel").value||"device"});' +
    'toast(r.ok?("新密钥（只显示一次）："+r.body.key):"生成失败",r.ok?"ok":"err");if(r.ok){document.getElementById("keyLabel").value="";loadKeys();loadUsers()}};' +
    'document.getElementById("saveServer").onclick=async()=>{const r=await put("/api/v1/admin/settings",{server:{publicUrl:document.getElementById("publicUrl").value.trim(),trustedProxyIps:document.getElementById("trustedProxyIps").value}});toast(r.ok?"已保存":"保存失败："+r.status,r.ok?"ok":"err")};' +
    'document.getElementById("saveUi").onclick=async()=>{const r=await put("/api/v1/admin/settings",{ui:{backgroundUrl:document.getElementById("backgroundUrl").value.trim()}});toast(r.ok?"已保存，刷新可见":"保存失败："+r.status,r.ok?"ok":"err")};' +
    'document.getElementById("saveOidc").onclick=async()=>{const r=await put("/api/v1/admin/settings",{oidc:{enabled:oidcEnabled.checked,onlySso:onlySso.checked,bindRequireVerification:bindRequire.checked,issuer:issuer.value.trim(),clientId:clientId.value.trim(),clientSecret:clientSecret.value,scopes:scopes.value,allowedDomains:allowedDomains.value}});' +
    'if(r.ok){clientSecret.value="";toast("已保存","ok")}else toast("保存失败："+((r.body.error&&r.body.error.code)||r.status),"err")};' +
    'document.getElementById("saveSmtp").onclick=async()=>{const r=await put("/api/v1/admin/settings",{smtp:{host:smtpHost.value.trim(),port:+smtpPort.value,secure:smtpSecure.checked,user:smtpUser.value,pass:smtpPass.value,from:smtpFrom.value}});if(r.ok){smtpPass.value="";toast("已保存","ok")}else toast("保存失败："+r.status,"err")};' +
    'document.getElementById("testSmtp").onclick=async()=>{const r=await post("/api/v1/admin/smtp/test",{to:document.getElementById("smtpTestTo").value.trim()});toast(r.ok?"测试邮件已发送":"发送失败："+r.status,r.ok?"ok":"err")};' +
    'document.getElementById("saveLimits").onclick=async()=>{const r=await put("/api/v1/admin/settings",{limits:{sessionTtlMs:+sessionTtl.value,userConnectionLimit:+connLimit.value,userRatePerMinute:+userRate.value,anonRatePerMinute:+anonRate.value},ice:{stunUrls:stunUrls.value,turnUrls:turnUrls.value,turnUsername:turnUser.value,turnPassword:turnPass.value}});if(r.ok){turnPass.value="";toast("已保存","ok")}else toast("保存失败："+r.status,"err")};' +
    'loadUsers();loadDevices();loadAudit();loadSettings();' +
    '</script>', background)
}
