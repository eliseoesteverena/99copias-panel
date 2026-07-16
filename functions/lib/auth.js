// functions/lib/auth.js
//
// Verifica el access token (JWT) que manda el frontend en el header
// Authorization: Bearer <token>, contra el JWKS público de Auth0.
//
// No confiamos en nada que mande el navegador salvo la firma del token:
// el token lo emite Auth0 después de un login real, y acá solo chequeamos
// que sea válido, no esté vencido, y tenga el audience/issuer correctos.

import { jwtVerify, createRemoteJWKSet } from "jose";

// El JWKS se cachea a nivel de módulo (sobrevive entre requests mientras el
// worker esté "caliente"), así no pegamos contra Auth0 en cada request.
let jwks;
let jwksDomain;

function getJwks(domain) {
  if (!jwks || jwksDomain !== domain) {
    jwks = createRemoteJWKSet(new URL(`https://${domain}/.well-known/jwks.json`));
    jwksDomain = domain;
  }
  return jwks;
}

/**
 * Verifica el Bearer token de la request.
 * @returns {Promise<{ok: true, claims: object} | {ok: false, status: number, error: string}>}
 */
export async function verifyAuth(request, env) {
  const authHeader = request.headers.get("Authorization") || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return { ok: false, status: 401, error: "Falta el header Authorization: Bearer <token>" };
  }

  if (!env.AUTH0_DOMAIN || !env.AUTH0_AUDIENCE) {
    return { ok: false, status: 500, error: "AUTH0_DOMAIN / AUTH0_AUDIENCE no configurados" };
  }

  try {
    const { payload } = await jwtVerify(token, getJwks(env.AUTH0_DOMAIN), {
      issuer: `https://${env.AUTH0_DOMAIN}/`,
      audience: env.AUTH0_AUDIENCE,
    });
    return { ok: true, claims: payload };
  } catch (err) {
    return { ok: false, status: 401, error: "Token inválido o vencido: " + err.message };
  }
}
