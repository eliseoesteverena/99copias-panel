// public/js/auth.js
//
// Wrapper chico sobre @auth0/auth0-spa-js (cargado por CDN en el <script>
// del HTML). Expone window.panelAuth con lo que necesitan las demás páginas.
//
// IMPORTANTE: audience/scope/redirect_uri se pasan explícitos tanto al
// crear el cliente COMO en cada loginWithRedirect() y getTokenSilently().
// Confiar solo en los defaults del cliente puede hacer que el /authorize
// real no incluya "offline_access", y entonces Auth0 nunca emite un refresh
// token — eso es lo que causaba el error "Missing Refresh Token".

let auth0Client = null;

function resolveParams() {
  const config = window.AUTH0_CONFIG;
  if (!config) {
    throw new Error("No se encontró la configuración window.AUTH0_CONFIG");
  }
  const ap = config.authorizationParams || {};
  return {
    audience: ap.audience || config.audience,
    scope: ap.scope || "openid profile email offline_access",
    redirect_uri: ap.redirect_uri || config.redirectUri,
  };
}

async function getClient() {
  if (!auth0Client) {
    const config = window.AUTH0_CONFIG;
    if (!config) {
      throw new Error("No se encontró la configuración window.AUTH0_CONFIG");
    }

    auth0Client = await auth0.createAuth0Client({
      domain: config.domain,
      clientId: config.clientId,
      cacheLocation: config.cacheLocation || "localstorage",
      useRefreshTokens: config.useRefreshTokens !== undefined ? config.useRefreshTokens : true,
      authorizationParams: resolveParams(),
    });
  }
  return auth0Client;
}

async function login() {
  const client = await getClient();
  // Pasamos authorizationParams EXPLÍCITOS acá también: es lo que garantiza
  // que el redirect real a Auth0 incluya audience + scope=offline_access.
  await client.loginWithRedirect({
    authorizationParams: resolveParams(),
  });
}

async function logout() {
  const client = await getClient();
  await client.logout({ logoutParams: { returnTo: window.location.origin + "/index.html" } });
}

async function handleRedirectCallback() {
  const client = await getClient();
  if (window.location.search.includes("code=") && window.location.search.includes("state=")) {
    await client.handleRedirectCallback();
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

async function isAuthenticated() {
  const client = await getClient();
  return client.isAuthenticated();
}

async function getUser() {
  const client = await getClient();
  return client.getUser();
}

async function getToken() {
  const client = await getClient();
  // Mismo motivo que en login(): forzamos audience/scope explícitos para
  // que coincidan siempre con los que se usaron al loguearse.
  return client.getTokenSilently({
    authorizationParams: resolveParams(),
  });
}

/**
 * Llamar al principio de cualquier página protegida (ej. pedidos.html).
 * Si no hay sesión, redirige al login. Si la vuelve de un redirect de Auth0
 * (?code=&state=), procesa el callback primero.
 */
async function requireAuth() {
  await handleRedirectCallback();
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    await login();
    return; // login() redirige, no sigue ejecutando
  }
}

/**
 * Wrapper de fetch que agrega el Bearer token automáticamente.
 * Si el token vence / la sesión es inválida, redirige al login.
 */
async function apiFetch(path, options = {}) {
  let token;
  try {
    token = await getToken();
  } catch (err) {
    await login();
    throw err;
  }

  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  if (res.status === 401) {
    await login();
    throw new Error("Sesión vencida, redirigiendo al login");
  }

  return res;
}

window.panelAuth = { login, logout, requireAuth, isAuthenticated, getUser, getToken, apiFetch };

