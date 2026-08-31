/**
 * auth.config.js — Configuración de Auth0 para el panel.
 *
 * TODO: reemplazá domain y clientId por los de tu Application en Auth0
 * (Dashboard → Applications → tu Application → Settings). Tiene que ser
 * tipo "Single Page Application". Instrucciones completas en el README,
 * sección "Autenticación (Auth0)".
 *
 * Estos dos valores son públicos por diseño (Auth0 los expone igual en la
 * URL de login) — no son secretos, no hace falta protegerlos.
 */
const AUTH_CONFIG = {
  domain: 'TU-TENANT.us.auth0.com',
  clientId: 'TU_CLIENT_ID',

  // No hace falta tocar nada más de acá para abajo — auth.js ya arma los
  // valores por defecto (redirectUri, logoutUri) en base al dominio del
  // panel. Se puede overridear si hiciera falta:
  // redirectUri: 'https://tu-panel.pages.dev/index.html',
  // logoutUri:   'https://tu-panel.pages.dev/login.html',
  // cacheLocation: 'memory',       // 'memory' (default) | 'localstorage'
  // useRefreshTokens: true,
};
