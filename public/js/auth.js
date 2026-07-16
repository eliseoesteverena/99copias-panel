// public/js/auth.js
//
// Wrapper chico sobre @auth0/auth0-spa-js (cargado por CDN en el <script>
// del HTML). Expone window.panelAuth con lo que necesitan las demás páginas.

let auth0Client = null;

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
      authorizationParams: {
        audience: config.authorizationParams?.audience || config.audience,
        // Si el scope no viene definido en config, por defecto usamos los necesarios para offline access
        scope: config.authorizationParams?.scope || "openid profile email offline_access",
        redirect_uri: config.authorizationParams?.redirect_uri || config.redirectUri,
      },
    });
  }
  return auth0Client;
}

async function login() {
  const client = await getClient();
  await client.loginWithRedirect();
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
  return client.getTokenSilently();
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
