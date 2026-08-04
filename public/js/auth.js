/**
 * auth.js — Módulo de autenticación Auth0 para el panel.
 *
 * Adaptado del módulo agnóstico original (mismo autor, otro proyecto).
 * Cambios respecto al original:
 *   - requireAuth() redirige a /login.html (pantalla propia del panel) en
 *     vez de mandar directo al Universal Login de Auth0.
 *   - login() y el manejo del callback ahora propagan un "returnTo" (vía
 *     appState de Auth0) para volver exactamente a la página que el
 *     usuario pedía — importante porque las notificaciones push linkean a
 *     una URL puntual (ej. /index.html?pedido=42) y no queremos perder
 *     ese destino en la vuelta del login.
 *
 * Dependencia (vía CDN, ya incluida en el <head> de cada página):
 *   https://cdn.auth0.com/js/auth0-spa-js/2.1/auth0-spa-js.production.js
 */

const Auth = (() => {
  let client = null;

  const defaults = {
    // Un solo callback URL registrado en Auth0 alcanza para todo el panel:
    // el "volver a la página que pediste" lo resuelve el appState/returnTo,
    // no el redirectUri en sí.
    redirectUri: `${window.location.origin}/index.html`,
    logoutUri: `${window.location.origin}/login.html`,
    cacheLocation: 'memory',
    useRefreshTokens: true,
  };

  async function init(config = {}) {
    if (!config.domain || !config.clientId) {
      throw new Error('[Auth] Se requieren "domain" y "clientId".');
    }
    if (config.domain.includes('TU-TENANT') || config.clientId.includes('TU_CLIENT_ID')) {
      throw new Error('[Auth] Falta configurar auth.config.js con los datos reales de tu Application de Auth0.');
    }

    const options = { ...defaults, ...config };

    client = await auth0.createAuth0Client({
      domain: options.domain,
      clientId: options.clientId,
      authorizationParams: { redirect_uri: options.redirectUri },
      cacheLocation: options.cacheLocation,
      useRefreshTokens: options.useRefreshTokens,
    });

    if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
      await _handleCallback();
    }

    return client;
  }

  async function _handleCallback() {
    let returnTo = null;
    try {
      const result = await client.handleRedirectCallback();
      returnTo = result && result.appState && result.appState.returnTo;
    } catch (err) {
      console.error('[Auth] Error al procesar el callback:', err);
    } finally {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    // Si el login se disparó pidiendo una página distinta a esta (ej. el
    // usuario quería /turnos.html), completamos el viaje ahora.
    // Comparamos contra pathname solo (no +search): acá el search todavía
    // puede tener el ?code=&state= del callback de Auth0 sin limpiar del
    // todo según el navegador, así que no es una base confiable para la
    // comparación. Si returnTo trae su propio query string (ej. un deep
    // link ?pedido=42), igual dispara el replace porque no va a matchear
    // el pathname solo — es exactamente el comportamiento que queremos.
    if (returnTo && returnTo !== window.location.pathname) {
      window.location.replace(returnTo);
    }
  }

  /**
   * @param {Object} [params]
   * @param {string} [params.screen_hint='login']
   * @param {string} [params.returnTo] — path+query a donde volver después del login
   */
  async function login(params = {}) {
    _assertInit();
    const { returnTo, screen_hint, ...resto } = params;
    await client.loginWithRedirect({
      appState: { returnTo: returnTo || window.location.pathname + window.location.search },
      authorizationParams: { screen_hint: screen_hint || 'login', ...resto },
    });
  }

  function logout(options = {}) {
    _assertInit();
    const returnTo = options.logoutUri || defaults.logoutUri;
    client.logout({ logoutParams: { returnTo } });
  }

  async function isAuthenticated() {
    _assertInit();
    return await client.isAuthenticated();
  }

  async function getUser() {
    _assertInit();
    const authenticated = await client.isAuthenticated();
    if (!authenticated) return null;
    return await client.getUser();
  }

  async function getToken(options = {}) {
    _assertInit();
    return await client.getTokenSilently(options);
  }

  /**
   * Guard para páginas protegidas. Si no hay sesión, manda a /login.html
   * (con ?returnTo= la página actual) en vez de ir directo a Auth0 — así
   * el usuario ve la pantalla del panel, no el Universal Login de una.
   * @returns {Promise<Object|null>} el usuario, o null si redirigió
   */
  async function requireAuth() {
    _assertInit();
    const authenticated = await client.isAuthenticated();
    if (!authenticated) {
      const destino = window.location.pathname + window.location.search;
      window.location.replace(`/login.html?returnTo=${encodeURIComponent(destino)}`);
      return null;
    }
    return await client.getUser();
  }

  function _assertInit() {
    if (!client) {
      throw new Error('[Auth] Llamá a Auth.init(config) antes de usar este método.');
    }
  }

  return { init, login, logout, isAuthenticated, getUser, getToken, requireAuth };
})();
