
const STYLE = '*{box-sizing:border-box}' +
  'body{font:14px/1.6 system-ui,sans-serif;margin:0;padding:28px 24px 64px;color:#1f2328;background:#fff}' +
  'h1{font-size:20px;margin:0 0 18px}h2{font-size:15px;margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid #eaeef2}' +
  'label{display:block;margin:10px 0 4px;font-weight:600}input,select{width:100%;padding:7px 9px;border:1px solid #d0d7de;border-radius:6px;font:inherit;box-sizing:border-box}' +
  'button{margin-top:12px;padding:8px 14px;border:0;border-radius:6px;background:#1f6feb;color:#fff;font:inherit;cursor:pointer}' +
  'button.ghost{background:#f6f8fa;color:#1f2328;border:1px solid #d0d7de;margin:0 4px 0 0;padding:4px 9px;font-size:12px}' +
  'table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:6px;border-bottom:1px solid #eaeef2;font-size:12.5px;vertical-align:middle}' +
  '.muted{color:#656d76}.err{color:#cf222e}.ok{color:#1a7f37}' +
  '.key{font-family:ui-monospace,monospace;background:#f6f8fa;padding:9px;border-radius:6px;word-break:break-all;font-size:12px}' +
  '/* 黄金比例主布局：内容区 : 侧栏 = 1.618 : 1 */' +
  '.layout{display:grid;grid-template-columns:1.618fr 1fr;gap:28px;align-items:start}' +
  '.layout>*{min-width:0}' +
  'table{display:block;overflow-x:auto;white-space:nowrap}' +
  '@media (max-width:860px){.layout{grid-template-columns:1fr}}' +
  'fieldset{border:1px solid #eaeef2;border-radius:8px;padding:4px 14px 14px;margin:0 0 6px}legend{padding:0 6px;font-weight:600}' +
  '.panel{max-width:420px;margin:8vh auto;background:rgba(255,255,255,.94);padding:28px;border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.18)}' +
  '.pill{display:inline-block;padding:1px 7px;border-radius:10px;background:#eef2f7;font-size:11.5px;color:#424a53}' +
  '.pill.off{background:#ffebe9;color:#cf222e}'

const attr = (value: string) => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
const bg = (url?: string) => (url && /^https:\/\/[A-Za-z0-9._~:/?#\[\]@!$&*+,=%-]+$/i.test(url))
  ? ' style="background:#0d1117 url(&quot;' + attr(url) + '&quot;) center/cover fixed no-repeat"'
  : ''
const shell = (title: string, body: string, background?: string): string => '<!doctype html><html lang="zh"><head><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title>' +
  '<style>' + STYLE + '</style></head><body' + bg(background) + '>' + body + '</body></html>'

export function setupPage(setupKey: string, suggestedOrigin = '', error?: string): string {
  return shell('初始化', '<h1>初始化 DSH Remote</h1>' +
    '<p class="muted">需要一次性初始化密钥（见服务端启动日志的 SETUP KEY 区块）。创建首个管理员后该页面自动关闭。</p>' +
    '<form method="post" action="/api/v1/setup">' +
    '<label>初始化密钥</label><input name="key" value="' + setupKey.replace(/[^A-Za-z0-9_-]/g, '') + '" required>' +
    '<label>公网地址（https://你的域名，可稍后在后台修改）</label><input name="publicUrl" placeholder="https://remote.example.com" value="' + attr(suggestedOrigin.startsWith('https://') ? suggestedOrigin : '') + '">' +
    '<label>管理员用户名</label><input name="username" required minlength="3" maxlength="64">' +
    '<label>密码（至少 12 位）</label><input name="password" type="password" required minlength="12">' +
    '<button type="submit">创建管理员</button></form>' + (error ? '<p class="err">' + error + '</p>' : ''))
}

export function loginPage(oidcEnabled: boolean, error?: string, background?: string): string {
  return shell('登录', '<div class="panel"><h1>登录 DSH Remote</h1>' +
    '<form method="post" action="/api/v1/auth/login"><label>用户名</label><input name="username" autocomplete="username" required>' +
    '<label>密码</label><input name="password" type="password" autocomplete="current-password" required>' +
    '<button type="submit">登录</button></form>' +
    (oidcEnabled ? '<p style="margin-top:16px"><a href="/api/v1/auth/oidc/start">使用 SSO 登录</a></p>' : '') +
    '<p class="muted" style="margin-top:14px"><a href="/register">注册</a> · <a href="/forgot">忘记密码</a></p>' +
    (error ? '<p class="err">' + error + '</p>' : '') + '</div>', background)
}

export function registerPage(onlySso: boolean, background?: string): string {
  if (onlySso) return shell('注册', '<div class="panel"><h1>注册已关闭</h1><p class="muted">本站已启用仅 SSO，账号由身份提供方创建。</p><p><a href="/login">返回登录</a></p></div>', background)
  return shell('注册', '<div class="panel"><h1>注册 DSH Remote</h1>' +
    '<label>邮箱</label><input id="email" type="email" autocomplete="email">' +
    '<button type="button" id="send" class="ghost">发送验证码</button>' +
    '<label>验证码</label><input id="code" inputmode="numeric" maxlength="6">' +
    '<label>密码（至少 12 位）</label><input id="password" type="password" autocomplete="new-password">' +
    '<button type="button" id="submit">创建账户</button><div id="out"></div>' +
    '<p class="muted"><a href="/login">返回登录</a></p></div>' +
    '<script>' +
    'const say=(c,m)=>{document.getElementById("out").innerHTML="<p class="+c+">"+m+"</p>"};' +
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
  if (onlySso) return shell('找回密码', '<div class="panel"><h1>找回密码已禁用</h1><p class="muted">仅 SSO 模式下请通过身份提供方登录。</p><p><a href="/login">返回登录</a></p></div>', background)
  return shell('找回密码', '<div class="panel"><h1>找回密码</h1>' +
    '<label>邮箱</label><input id="email" type="email">' +
    '<button type="button" id="send" class="ghost">发送验证码</button>' +
    '<label>验证码</label><input id="code" inputmode="numeric" maxlength="6">' +
    '<label>新密码（至少 12 位）</label><input id="password" type="password">' +
    '<button type="button" id="submit">重置密码</button><div id="out"></div>' +
    '<p class="muted"><a href="/login">返回登录</a></p></div>' +
    '<script>' +
    'const say=(c,m)=>{document.getElementById("out").innerHTML="<p class="+c+">"+m+"</p>"};' +
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
  return shell('绑定账户', '<div class="panel"><h1>绑定已有账户</h1>' +
    '<p class="muted">该邮箱已注册但尚未绑定此 SSO 身份：' + email.replace(/[<>&"]/g, '') + '</p>' +
    '<label>验证方式</label><select id="mode">' +
    (onlySso ? '' : '<option value="password">账户密码</option>') +
    '<option value="code">邮箱验证码</option></select>' +
    '<div id="pw"' + (onlySso ? ' style="display:none"' : '') + '><label>密码</label><input id="password" type="password"></div>' +
    '<div id="cd" style="display:none"><button type="button" id="send" class="ghost">发送验证码</button>' +
    '<label>验证码</label><input id="code" inputmode="numeric" maxlength="6"></div>' +
    '<button type="button" id="submit">绑定并登录</button><div id="out"></div></div>' +
    '<script>' +
    'const ticket=new URLSearchParams(location.search).get("ticket");' +
    'const say=(c,m)=>{document.getElementById("out").innerHTML="<p class="+c+">"+m+"</p>"};' +
    'const mode=document.getElementById("mode");' +
    'const sync=()=>{const code=mode.value==="code";document.getElementById("cd").style.display=code?"":"none";document.getElementById("pw").style.display=code?"none":""};' +
    'mode.onchange=sync;sync();' +
    'document.getElementById("send").onclick=async()=>{const r=await fetch("/api/v1/auth/oidc/bind/start",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({ticket})});say(r.status===202?"ok":"err",r.status===202?"验证码已发送":"发送失败（"+r.status+"）")};' +
    'document.getElementById("submit").onclick=async()=>{const body={ticket,mode:mode.value};' +
    'if(mode.value==="code")body.code=document.getElementById("code").value.trim();else body.password=document.getElementById("password").value;' +
    'const r=await fetch("/api/v1/auth/oidc/bind/complete",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});' +
    'if(r.ok){location.href="/"}else{const d=await r.json();say("err",(d.error&&d.error.code)||("失败 "+r.status))}};' +
    '</script>', background)
}

export function accountPage(username: string, email: string, oidcBound: boolean, onlySso: boolean, background?: string): string {
  const pw = onlySso ? '<p class="muted">仅 SSO 模式已启用，密码修改不可用。</p>' :
    '<form id="pw"><label>当前密码</label><input name="currentPassword" type="password">' +
    '<label>新密码（至少 12 位）</label><input name="newPassword" type="password">' +
    '<button type="submit">修改密码</button></form>'
  return shell('账户', '<div class="layout"><main>' +
    '<h1>我的账户</h1><p class="muted">' + username + ' · 邮箱：' + (email || '（未设置）') + '</p>' +
    '<h2>修改密码</h2>' + pw +
    '<h2>换绑邮箱</h2><form id="em"><label>新邮箱</label><input name="newEmail" type="email">' +
    '<button type="button" class="ghost" id="send">发送验证码</button>' +
    '<label>新邮箱验证码</label><input name="newCode" maxlength="6">' +
    '<label>原邮箱验证码（首次设置可留空）</label><input name="oldCode" maxlength="6">' +
    '<button type="submit">确认换绑</button></form>' +
    '<h2>OIDC</h2><p class="muted">' + (oidcBound ? '已绑定' : '未绑定') + '</p>' +
    '<p><a href="/api/v1/auth/oidc/start">绑定 / 重新绑定</a> ' +
    (onlySso ? '' : '<button class="ghost" type="button" id="unbind">解绑</button>') + '</p>' +
    '<div id="out"></div><p><a href="/">返回</a></p></main></div>' +
    '<script>' +
    'const say=(c,m)=>{document.getElementById("out").innerHTML="<p class="+c+">"+m+"</p>"};' +
    'const post=(p,b)=>fetch(p,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(b)});' +
    'const pw=document.getElementById("pw");if(pw)pw.addEventListener("submit",async e=>{e.preventDefault();const f=e.target;' +
    'const r=await post("/api/v1/auth/password/change",{currentPassword:f.currentPassword.value,newPassword:f.newPassword.value});' +
    'say(r.ok?"ok":"err",r.ok?"密码已修改":"修改失败（"+r.status+"）");if(r.ok)f.reset()});' +
    'document.getElementById("send").onclick=async()=>{const f=document.getElementById("em");' +
    'const r=await post("/api/v1/auth/email/change/start",{newEmail:f.newEmail.value.trim()});' +
    'say(r.status===202?"ok":"err",r.status===202?"验证码已发送":"发送失败（"+r.status+"）")};' +
    'document.getElementById("em").addEventListener("submit",async e=>{e.preventDefault();const f=e.target;' +
    'const r=await post("/api/v1/auth/email/change/complete",{newEmail:f.newEmail.value.trim(),newCode:f.newCode.value.trim(),oldCode:f.oldCode.value.trim()});' +
    'say(r.ok?"ok":"err",r.ok?"邮箱已换绑":"换绑失败（"+r.status+"）");if(r.ok)setTimeout(()=>location.reload(),600)});' +
    'const ub=document.getElementById("unbind");if(ub)ub.onclick=async()=>{const r=await post("/api/v1/auth/oidc/unbind",{});say(r.ok?"ok":"err",r.ok?"已解绑":"解绑失败（"+r.status+"）")};' +
    '</script>', background)
}

export function homePage(username: string, role: string): string {
  return shell('DSH Remote', '<h1>DSH Remote</h1><p>已登录：' + username + '（' + role + '）</p>' +
    '<p class="muted">设备连接请使用「设备用户名 + 设备密钥」，与网页登录凭据相互独立。</p>' +
    '<p><a href="/account">我的账户</a> · <a href="/admin">管理后台</a> · <form method="post" action="/api/v1/auth/logout" style="display:inline"><button class="ghost" type="submit">退出</button></form></p>')
}

export function adminPage(username: string, background?: string): string {
  return shell('管理后台',
    '<h1>管理后台</h1><p class="muted">' + username + ' · <a href="/">返回</a> · ' +
    '<form method="post" action="/api/v1/auth/logout" style="display:inline"><button class="ghost" type="submit">退出</button></form></p>' +
    '<div class="layout"><main>' +
      '<h2>用户</h2><table><thead><tr><th>用户名</th><th>设备用户名</th><th>角色</th><th>密钥</th><th>操作</th></tr></thead><tbody id="rows"></tbody></table>' +
      '<form id="create"><label>新建用户名</label><input name="username" required minlength="3">' +
      '<label>初始密码（可留空）</label><input name="password" type="password">' +
      '<label>角色</label><select name="role"><option value="user">user</option><option value="admin">admin</option></select>' +
      '<button type="submit">创建用户</button></form>' +
      '<h2>设备密钥 <span class="muted" id="keyOwner">（未选择用户）</span></h2>' +
      '<table><thead><tr><th>标签</th><th>设备数</th><th>状态</th><th>操作</th></tr></thead><tbody id="keys"></tbody></table>' +
      '<form id="newkey"><label>新密钥标签</label><input name="label" placeholder="例如 客厅 iPad" maxlength="64">' +
      '<button type="submit">生成密钥</button></form>' +
      '<div id="out"></div>' +
    '</main><aside>' +
      '<h2>OIDC</h2><form id="oidc"><fieldset><legend>单点登录</legend>' +
      '<label><input type="checkbox" name="enabled" style="width:auto;margin-right:8px">启用 OIDC</label>' +
      '<label><input type="checkbox" name="onlySso" style="width:auto;margin-right:8px">仅允许 SSO（禁用密码登录与普通用户名设备登录）</label>' +
      '<label>Issuer</label><input name="issuer" placeholder="https://idp.example.com">' +
      '<label>Client ID</label><input name="clientId">' +
      '<label>Client Secret（留空不修改）</label><input name="clientSecret" type="password" placeholder="不修改">' +
      '<label>Scopes</label><input name="scopes" value="openid email profile">' +
      '<label>允许邮箱域（逗号分隔）</label><input name="allowedDomains">' +
      '<label><input type="checkbox" name="autoProvision" style="width:auto;margin-right:8px">首次登录自动开通</label>' +
      '</fieldset><button type="submit">保存 OIDC</button></form>' +
      '<h2>服务地址</h2><form id="server"><fieldset><legend>公网与代理</legend>' +
      '<label>公网地址（https，留空按请求推导）</label><input name="publicUrl" placeholder="https://remote.example.com">' +
      '<label>额外可信代理 IP（逗号分隔；内网与回环默认信任）</label><input name="trustedProxyIps" placeholder="203.0.113.7">' +
      '</fieldset><button type="submit">保存服务地址</button></form>' +
      '<h2>外观</h2><form id="ui"><fieldset><legend>登录页背景</legend>' +
      '<label>背景图 URL（仅 https）</label><input name="backgroundUrl" placeholder="https://t.hinswu.top/pixiv">' +
      '</fieldset><button type="submit">保存外观</button></form>' +
      '<h2>SMTP</h2><form id="smtp"><fieldset><legend>发信</legend>' +
      '<label>Host</label><input name="host">' +
      '<label>Port</label><input name="port" type="number" min="1" max="65535">' +
      '<label><input type="checkbox" name="secure" style="width:auto;margin-right:8px">SSL/TLS（465 用）</label>' +
      '<label>用户名</label><input name="user">' +
      '<label>密码（留空不修改）</label><input name="pass" type="password">' +
      '<label>发件人</label><input name="from" placeholder="DSH Remote &lt;no-reply@example.com&gt;">' +
      '<label>测试收件人</label><input name="testTo">' +
      '</fieldset><button type="submit">保存 SMTP</button><button type="button" class="ghost" id="smtptest" style="margin-left:8px">发送测试</button></form>' +
      '<h2>我的 OIDC</h2><div class="muted" id="oidcstate">加载中…</div>' +
      '<p><a href="/api/v1/auth/oidc/start">绑定 / 重新绑定 OIDC</a> ' +
      '<button class="ghost" type="button" id="unbind">解绑</button></p>' +
      '<h2>限额与 ICE</h2><form id="limits"><fieldset><legend>限额</legend>' +
      '<label>会话有效期（毫秒）</label><input name="sessionTtlMs" type="number" min="300000">' +
      '<label>普通用户每分钟请求</label><input name="userRatePerMinute" type="number" min="10">' +
      '<label>匿名每分钟请求</label><input name="anonRatePerMinute" type="number" min="1">' +
      '<label>并发连接数</label><input name="userConnectionLimit" type="number" min="1">' +
      '</fieldset><fieldset><legend>ICE</legend>' +
      '<label>STUN</label><input name="stunUrls">' +
      '<label>TURN</label><input name="turnUrls">' +
      '<label>TURN 用户名</label><input name="turnUsername">' +
      '<label>TURN 密码（留空不修改）</label><input name="turnPassword" type="password">' +
      '</fieldset><button type="submit">保存限额与 ICE</button></form>' +
      '<div id="out2"></div>' +
    '</aside></div>' +
    '<script>' +
    'var currentUser=null;' +
    'const esc=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]));' +
    'const out=document.getElementById("out");const say=(c,m)=>{out.innerHTML="<p class="+c+">"+esc(m)+"</p>"};' +
    'async function loadUsers(){const r=await fetch("/api/v1/admin/users");const d=await r.json();' +
    'document.getElementById("rows").innerHTML=(d.users||[]).map(u=>"<tr><td>"+esc(u.username)+"</td><td><code>"+esc(u.deviceUsername||"-")+"</code></td><td>"+u.role+"</td><td>"+u.deviceKeys+"</td>"+' +
    '"<td><button class=ghost data-act=pick data-id="+u.id+" data-name="+esc(u.deviceUsername||u.username)+">密钥</button><button class=ghost data-act=toggle data-id="+u.id+">"+(u.disabled?"启用":"禁用")+"</button><button class=ghost data-act=del data-id="+u.id+">删除</button></td></tr>").join("")}' +
    'async function loadKeys(){if(!currentUser){document.getElementById("keys").innerHTML="";return}' +
    'const d=await (await fetch("/api/v1/admin/users/"+currentUser.id+"/device-keys")).json();' +
    'document.getElementById("keys").innerHTML=(d.keys||[]).map(k=>"<tr><td>"+esc(k.label)+"</td><td><span class=pill>"+k.deviceCount+"</span></td>"+' +
    '"<td>"+(k.revoked?"<span class=\"pill off\">已吊销</span>":"正常")+"</td><td>"+(k.revoked||k.id==="unbound"?"":"<button class=ghost data-act=revoke data-id="+k.id+">吊销</button>")+"</td></tr>").join("")}' +
    'function pick(u){currentUser=u;document.getElementById("keyOwner").textContent="（"+u.deviceUsername+"）";loadKeys()}' +
    'document.addEventListener("click",async e=>{const b=e.target.closest("button[data-act]");if(!b)return;const id=b.dataset.id;' +
    'if(b.dataset.act==="pick")pick({id:id,deviceUsername:b.dataset.name});' +
    'else if(b.dataset.act==="revoke"){await fetch("/api/v1/admin/device-keys/"+id,{method:"DELETE"});loadKeys();loadUsers()}' +
    'else if(b.dataset.act==="del"){await fetch("/api/v1/admin/users/"+id,{method:"DELETE"});loadUsers()}' +
    'else if(b.dataset.act==="toggle"){await fetch("/api/v1/admin/users/"+id,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({toggle:true})});loadUsers()}});' +
    'document.getElementById("create").addEventListener("submit",async e=>{e.preventDefault();const f=new FormData(e.target);' +
    'const r=await fetch("/api/v1/admin/users",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username:f.get("username"),password:f.get("password")||undefined,role:f.get("role")})});' +
    'const d=await r.json();r.ok?(say("ok","已创建"),e.target.reset(),loadUsers()):say("err","创建失败："+(d.error&&d.error.code))});' +
    'document.getElementById("newkey").addEventListener("submit",async e=>{e.preventDefault();if(!currentUser)return say("err","先选择一个用户");' +
    'const f=new FormData(e.target);const r=await fetch("/api/v1/admin/users/"+currentUser.id+"/device-keys",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({label:f.get("label")||"device"})});' +
    'const d=await r.json();if(r.ok){say("ok","新设备密钥（只显示一次）："+d.key);e.target.reset();loadKeys();loadUsers()}else say("err","生成失败")});' +
    'async function loadServer(){const d=await (await fetch("/api/v1/admin/settings")).json();const f=document.getElementById("server");' +
    'f.publicUrl.value=(d.server&&d.server.publicUrl)||"";f.trustedProxyIps.value=((d.server&&d.server.trustedProxyIps)||[]).join(",")}' +
    'document.getElementById("server").addEventListener("submit",async e=>{e.preventDefault();const f=e.target;' +
    'const r=await fetch("/api/v1/admin/settings",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({server:{publicUrl:f.publicUrl.value.trim(),trustedProxyIps:f.trustedProxyIps.value}})});' +
    'say2(r.ok?"ok":"err",r.ok?"服务地址已保存":"保存失败（"+r.status+"）")});' +
    'async function loadSettings(){const d=await (await fetch("/api/v1/admin/settings")).json();const o=d.oidc;const f=document.getElementById("oidc");' +
    'f.enabled.checked=!!o.enabled;f.onlySso.checked=!!o.onlySso;f.issuer.value=o.issuer||"";f.clientId.value=o.clientId||"";f.scopes.value=o.scopes||"openid email profile";' +
    'f.allowedDomains.value=(o.allowedDomains||[]).join(",");f.autoProvision.checked=o.autoProvision!==false;' +
    'const l=d.limits;const g=document.getElementById("limits");g.sessionTtlMs.value=l.sessionTtlMs;g.userRatePerMinute.value=l.userRatePerMinute;' +
    'g.anonRatePerMinute.value=l.anonRatePerMinute;g.userConnectionLimit.value=l.userConnectionLimit;' +
    'g.stunUrls.value=(d.ice.stunUrls||[]).join(",");g.turnUrls.value=(d.ice.turnUrls||[]).join(",");g.turnUsername.value=d.ice.turnUsername||""}' +
    'const out2=document.getElementById("out2");const say2=(c,m)=>{out2.innerHTML="<p class="+c+">"+esc(m)+"</p>"};' +
    'document.getElementById("oidc").addEventListener("submit",async e=>{e.preventDefault();const f=e.target;' +
    'const body={oidc:{enabled:f.enabled.checked,onlySso:f.onlySso.checked,issuer:f.issuer.value,clientId:f.clientId.value,clientSecret:f.clientSecret.value,scopes:f.scopes.value,allowedDomains:f.allowedDomains.value,autoProvision:f.autoProvision.checked}};' +
    'const r=await fetch("/api/v1/admin/settings",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(body)});' +
    'r.ok?(f.clientSecret.value="",say2("ok","已保存")):say2("err","保存失败："+(r.status))});' +
    'document.getElementById("limits").addEventListener("submit",async e=>{e.preventDefault();const f=e.target;' +
    'const body={limits:{sessionTtlMs:+f.sessionTtlMs.value,userRatePerMinute:+f.userRatePerMinute.value,anonRatePerMinute:+f.anonRatePerMinute.value,userConnectionLimit:+f.userConnectionLimit.value},' +
    'ice:{stunUrls:f.stunUrls.value,turnUrls:f.turnUrls.value,turnUsername:f.turnUsername.value,turnPassword:f.turnPassword.value}};' +
    'const r=await fetch("/api/v1/admin/settings",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(body)});' +
    'r.ok?(f.turnPassword.value="",say2("ok","已保存")):say2("err","保存失败："+(r.status))});' +
    'async function loadExtra(){const d=await (await fetch("/api/v1/admin/settings")).json();' +
    'const u=document.getElementById("ui");u.backgroundUrl.value=(d.ui&&d.ui.backgroundUrl)||"";' +
    'const m=document.getElementById("smtp");const c=d.smtp||{};m.host.value=c.host||"";m.port.value=c.port||587;m.secure.checked=!!c.secure;' +
    'm.user.value=c.user||"";m.from.value=c.from||"";' +
    'document.getElementById("oidcstate").textContent=(d.oidc&&d.oidc.enabled)?("OIDC 已启用，绑定时会跳转身份提供方"):("OIDC 未启用")}' +
    'document.getElementById("ui").addEventListener("submit",async e=>{e.preventDefault();const f=e.target;' +
    'const r=await fetch("/api/v1/admin/settings",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({ui:{backgroundUrl:f.backgroundUrl.value}})});' +
    'say2(r.ok?"ok":"err",r.ok?"外观已保存，刷新可见":"保存失败（"+r.status+"）")});' +
    'document.getElementById("smtp").addEventListener("submit",async e=>{e.preventDefault();const f=e.target;' +
    'const body={smtp:{host:f.host.value,port:+f.port.value,secure:f.secure.checked,user:f.user.value,pass:f.pass.value,from:f.from.value}};' +
    'const r=await fetch("/api/v1/admin/settings",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify(body)});' +
    'f.pass.value="";say2(r.ok?"ok":"err",r.ok?"SMTP 已保存":"保存失败（"+r.status+"）")});' +
    'document.getElementById("smtptest").onclick=async()=>{const to=document.getElementById("smtp").testTo.value.trim();' +
    'const r=await fetch("/api/v1/admin/smtp/test",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({to})});' +
    'say2(r.ok?"ok":"err",r.ok?"测试邮件已发送":"发送失败（"+r.status+"）")};' +
    'document.getElementById("unbind").onclick=async()=>{const r=await fetch("/api/v1/auth/oidc/unbind",{method:"POST"});say2(r.ok?"ok":"err",r.ok?"已解绑":"解绑失败（"+r.status+"）");loadExtra()};' +
    'loadUsers();loadSettings();loadExtra();loadServer();' +
    '</script>', background)
}

