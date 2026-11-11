import { createServer } from 'node:http'
import { createHash } from 'node:crypto'
import { SignJWT, generateKeyPair, exportJWK } from 'jose'
import { OidcClient } from './build/oidc.js'

let pass = 0, fail = 0
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? ' :: ' + extra : '')) }

// ── configurable fake OP ─────────────────────────────────────────────────────
const rsa = await generateKeyPair('RS256')
const jwk = { ...(await exportJWK(rsa.publicKey)), kid: 'rsa1', alg: 'RS256', use: 'sig' }
const hsSecret = new TextEncoder().encode('hs-secret')
const codes = new Map()
let mode = 'ok'
let lastVerifier = ''
let issuer = ''
const idp = createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1')
  const send = (status, value) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)) }
  if (url.pathname === '/.well-known/openid-configuration') {
    return send(200, {
      issuer: mode === 'issuer-mismatch' ? issuer + '/other' : issuer,
      authorization_endpoint: issuer + '/authorize', token_endpoint: issuer + '/token',
      jwks_uri: issuer + '/jwks', userinfo_endpoint: issuer + '/userinfo',
    })
  }
  if (url.pathname === '/jwks') return send(200, { keys: [jwk] })
  if (url.pathname === '/userinfo') {
    return send(200, mode === 'userinfo-mismatch'
      ? { sub: 'other-sub', email: 'x@example.com' }
      : { sub: 'sub-1', email: 'user@example.com' })
  }
  if (url.pathname === '/token') {
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      const params = new URLSearchParams(body)
      lastVerifier = params.get('code_verifier') || ''
      const code = params.get('code') || ''
      const entry = codes.get(code)
      codes.delete(code)
      if (!entry) return send(400, { error: 'invalid_grant' })
      const claims = { nonce: mode === 'bad-nonce' ? 'wrong' : entry.nonce }
      if (!mode.startsWith('userinfo')) {
        claims.email = mode === 'domain' ? 'user@other.test' : mode === 'uppercase' ? 'User@Example.COM' : 'user@example.com'
        claims.email_verified = true
      }
      if (mode === 'azp') claims.azp = 'wrong'
      const alg = mode === 'hs256' ? 'HS256' : 'RS256'
      const token = await new SignJWT(claims)
        .setProtectedHeader({ alg, ...(alg === 'HS256' ? {} : { kid: 'rsa1' }) })
        .setIssuer(issuer)
        .setAudience(mode === 'azp' ? ['cid', 'other'] : 'cid')
        .setSubject('sub-1').setIssuedAt().setExpirationTime('5m')
        .sign(alg === 'HS256' ? hsSecret : rsa.privateKey)
      return send(200, { id_token: token, ...(mode.startsWith('userinfo') ? { access_token: 'at-1' } : {}) })
    })
    return
  }
  send(404, {})
})
await new Promise(resolve => idp.listen(0, '127.0.0.1', resolve))
issuer = 'http://127.0.0.1:' + idp.address().port

const baseConfig = { issuer, clientId: 'cid', clientSecret: 'sekrit', scopes: 'openid email profile', allowedDomains: [], autoProvision: true }
const client = new OidcClient(baseConfig, 'http://127.0.0.1:9')

async function begin(c = client) {
  const { url, state } = await c.authorizationUrl()
  const parsed = new URL(url)
  const code = 'c-' + Math.random().toString(36).slice(2)
  codes.set(code, { nonce: parsed.searchParams.get('nonce') })
  return { url: parsed, state, code }
}
async function expectReject(name, fn, code) {
  try { await fn(); check(name, false, 'resolved') }
  catch (error) { check(name, code ? error.code === code : true, String(error.code || error.name || error.message)) }
}

// O1: the discovery document must describe the configured issuer.
mode = 'issuer-mismatch'
const bad = new OidcClient(baseConfig, 'http://127.0.0.1:9')
await expectReject('[O1] discovery issuer mismatch is refused', () => bad.authorizationUrl(), 'OIDC_ISSUER_MISMATCH')
mode = 'ok'

// O2: state is single use and expires.
const a = await begin()
await client.complete(a.code, a.state)
await expectReject('[O2] state is single use', () => client.complete(a.code, a.state), 'OIDC_INVALID_STATE')
const b = await begin()
client.pending.get(b.state).expires = Date.now() - 1
await expectReject('[O2] expired state is refused', () => client.complete(b.code, b.state), 'OIDC_INVALID_STATE')
mode = 'bad-nonce'
const badNonce = await begin()
await expectReject('[O2] nonce must match', () => client.complete(badNonce.code, badNonce.state), 'OIDC_INVALID_NONCE')
mode = 'ok'

// O3: PKCE S256 and the verifier matches the challenge.
const c = await begin()
check('[O3] PKCE S256 is used', c.url.searchParams.get('code_challenge_method') === 'S256' && (c.url.searchParams.get('code_challenge') || '').length === 43)
await client.complete(c.code, c.state)
check('[O3] the verifier matches the challenge', createHash('sha256').update(lastVerifier).digest('base64url') === c.url.searchParams.get('code_challenge'))
const replayCode = await begin()
await client.complete(replayCode.code, replayCode.state)
const replayState = await begin()
await expectReject('[O3] a replayed authorization code is rejected', () => client.complete(replayCode.code, replayState.state), 'OIDC_TOKEN_EXCHANGE_FAILED')

// O4: HMAC-signed ID tokens are outside the algorithm whitelist.
mode = 'hs256'
const d = await begin()
await expectReject('[O4] HMAC id_tokens are refused', () => client.complete(d.code, d.state), 'ERR_JOSE_ALG_NOT_ALLOWED')
mode = 'ok'

// O5: azp must equal client_id when present.
mode = 'azp'
const e = await begin()
await expectReject('[O5] azp must equal client_id', () => client.complete(e.code, e.state), 'OIDC_INVALID_AZP')
mode = 'ok'

// O6: userinfo is only trusted when its sub matches the ID token.
mode = 'userinfo-mismatch'
const f = await begin()
const claims = await client.complete(f.code, f.state)
check('[O6] userinfo with a different sub is ignored', claims.email === undefined, String(claims.email))
mode = 'userinfo-ok'
const matching = await begin()
const matchingClaims = await client.complete(matching.code, matching.state)
check('[O6] userinfo with a matching sub is accepted', matchingClaims.email === 'user@example.com', String(matchingClaims.email))
mode = 'ok'

// O7: allowedDomains is enforced; a valid address is normalized and accepted.
const strict = new OidcClient({ ...baseConfig, allowedDomains: ['example.com'] }, 'http://127.0.0.1:9')
mode = 'domain'
const g = await begin(strict)
await expectReject('[O7] email outside allowedDomains is refused', () => strict.complete(g.code, g.state), 'OIDC_DOMAIN_NOT_ALLOWED')
mode = 'ok'
const h = await begin(strict)
const allowed = await strict.complete(h.code, h.state)
check('[O7] allowed domain and normalized email pass', allowed.email === 'user@example.com', String(allowed.email))
mode = 'uppercase'
const upper = await begin(strict)
const upperClaims = await strict.complete(upper.code, upper.state)
check('[O7] email is lowercased before matching', upperClaims.email === 'user@example.com', String(upperClaims.email))
mode = 'ok'

await new Promise(resolve => idp.close(resolve))
console.log('\n' + pass + ' passed, ' + fail + ' failed')
process.exitCode = fail === 0 ? 0 : 1
