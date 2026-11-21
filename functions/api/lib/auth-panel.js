// functions/lib/auth-panel.js  (PANEL)
//
// Verifica que quien llama a una Function es un usuario logueado del Panel.
// Se usa SOLO en las rutas nuevas y destructivas (crear y eliminar pedidos): el
// resto de /api/* sigue como está (decisión documentada en auth-ui.js).
//
// Cómo funciona: el navegador manda el ID token de Auth0 (un JWT firmado, RS256)
// en `Authorization: Bearer ...`. Acá se valida la firma contra las claves públicas
// del tenant (JWKS), el emisor, la audiencia (= Client ID de la app) y el vencimiento.
// No hace falta crear una "API" en Auth0: el login actual no pide audience.
//
// Variables de entorno del Panel (no son secretos, son los mismos valores de auth.config.js):
//   AUTH0_DOMAIN         ej. mi-tenant.us.auth0.com
//   AUTH0_CLIENT_ID      el clientId de la Application de Auth0
//   PANEL_ALLOWED_EMAILS (recomendado) lista separada por comas de quién puede operar,
//                        ej. "yo@mail.com,socio@mail.com". Si está vacía, cualquier
//                        usuario válido del tenant pasa — peligroso si en Auth0 está
//                        habilitado el registro libre (sign-ups).

let cacheJwks = { domain: null, keys: null, at: 0 };
const TTL_JWKS_MS = 10 * 60 * 1000;

function base64urlABytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const base64urlAJson = (s) => JSON.parse(new TextDecoder().decode(base64urlABytes(s)));

async function obtenerClaves(domain, forzar = false) {
  const vigente = cacheJwks.domain === domain && cacheJwks.keys && Date.now() - cacheJwks.at < TTL_JWKS_MS;
  if (vigente && !forzar) return cacheJwks.keys;
  const res = await fetch(`https://${domain}/.well-known/jwks.json`);
  if (!res.ok) throw new Error(`JWKS ${res.status}`);
  const { keys } = await res.json();
  cacheJwks = { domain, keys: keys || [], at: Date.now() };
  return cacheJwks.keys;
}

const falla = (status, error) => ({ ok: false, status, error });

/**
 * @returns {Promise<{ok:true, email:string|null, sub:string} | {ok:false, status:number, error:string}>}
 */
export async function verificarSesion(request, env) {
  const domain = String(env.AUTH0_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const clientId = env.AUTH0_CLIENT_ID;
  if (!domain || !clientId) {
    return falla(503, 'Falta configurar AUTH0_DOMAIN y AUTH0_CLIENT_ID en el Panel.');
  }

  const m = (request.headers.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return falla(401, 'Iniciá sesión para realizar esta acción.');
  const partes = m[1].split('.');
  if (partes.length !== 3) return falla(401, 'Sesión inválida.');
  const [h64, p64, s64] = partes;

  try {
    const header = base64urlAJson(h64);
    if (header.alg !== 'RS256') return falla(401, 'Sesión inválida.');

    let claves = await obtenerClaves(domain);
    let jwk = claves.find((k) => k.kid === header.kid);
    if (!jwk) { // Auth0 pudo rotar claves: un reintento antes de rechazar
      claves = await obtenerClaves(domain, true);
      jwk = claves.find((k) => k.kid === header.kid);
    }
    if (!jwk) return falla(401, 'Sesión inválida.');

    const clave = await crypto.subtle.importKey(
      'jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
    );
    const firmaOk = await crypto.subtle.verify(
      'RSASSA-PKCS1-v1_5', clave, base64urlABytes(s64), new TextEncoder().encode(`${h64}.${p64}`)
    );
    if (!firmaOk) return falla(401, 'Sesión inválida.');

    const c = base64urlAJson(p64);
    const ahora = Math.floor(Date.now() / 1000);
    const audiencias = Array.isArray(c.aud) ? c.aud : [c.aud];
    if (c.iss !== `https://${domain}/` || !audiencias.includes(clientId)) return falla(401, 'Sesión inválida.');
    if (!c.exp || c.exp < ahora - 60) return falla(401, 'Tu sesión venció. Volvé a iniciar sesión.');

    const permitidos = String(env.PANEL_ALLOWED_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    const email = c.email ? String(c.email).toLowerCase() : null;
    if (permitidos.length) {
      // email_verified es obligatorio con lista: si no, alguien podría registrarse
      // en Auth0 con un mail permitido sin ser su dueño.
      if (!email || c.email_verified !== true || !permitidos.includes(email)) {
        return falla(403, 'Tu usuario no tiene permiso para realizar esta acción.');
      }
    }
    return { ok: true, email, sub: c.sub };
  } catch (err) {
    console.error('[auth-panel] Error verificando sesión', err);
    return falla(401, 'Sesión inválida.');
  }
}
