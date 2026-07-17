// public/js/auth.js
//
// Seguridad simplificada a propósito: el login de Auth0 es la ÚNICA puerta.
// No hay verificación de token en cada request a /api/* — las funciones del
// backend son de lectura/escritura directa una vez que entraste al panel.
// Esto es una decisión consciente para una herramienta interna de bajo
// volumen; si en algún momento el panel queda expuesto a más gente o se
// vuelve sensible, reforzar esto es el primer paso.

let auth0Client = null;

async function getClient() {
  if (!auth0Client) {
    auth0Client = await auth0.createAuth0Client({
      domain: window.AUTH0_CONFIG.domain,
      clientId: window.AUTH0_CONFIG.clientId,
      authorizationParams: {
        redirect_uri: window.AUTH0_CONFIG.redirectUri,
      },
      // localstorage (en vez de "memory", que es el default) para que la
      // sesión sobreviva a la navegación entre páginas — este es un sitio
      // multi-página estático, no una SPA con router, así que cada página
      // crea un cliente nuevo y necesita poder leer la sesión de algún lado.
      cacheLocation: "localstorage",
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

/**
 * Llamar al principio de cualquier página protegida. Si no hay sesión,
 * manda al login. Esta es la única verificación de todo el sistema.
 */
async function requireAuth() {
  await handleRedirectCallback();
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    await login();
  }
}

window.panelAuth = { login, logout, requireAuth, isAuthenticated, getUser };
