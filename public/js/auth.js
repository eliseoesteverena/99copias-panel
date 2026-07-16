// public/js/auth.js
//
// Wrapper chico sobre @auth0/auth0-spa-js (cargado por CDN en el <script>
// del HTML). Expone window.panelAuth con lo que necesitan las demás páginas.

let auth0Client = null;

async function getClient() {
  if (!auth0Client) {
    auth0Client = await auth0.createAuth0Client({
      domain: window.AUTH0_CONFIG.domain,
      clientId: window.AUTH0_CONFIG.clientId,
      authorizationParams: {
        audience: window.AUTH0_CONFIG.audience,
        redirect_uri: window.AUTH0_CONFIG.redirectUri,
      },
      cacheLocation: "localstorage", // sobrevive a recargas de página
      useRefreshTokens: true,
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
