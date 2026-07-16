// public/js/auth-config.js
//
// Completá esto con los datos de tu Application (tipo SPA) en Auth0:
// Dashboard > Applications > tu app > Settings.
//
// audience tiene que coincidir con el "Identifier" de la API que crees en
// Auth0 Dashboard > Applications > APIs (así el access token sirve para
// llamar a /api/* y no solo para identificar al usuario).
window.AUTH0_CONFIG = {
  domain: "TU-TENANT.us.auth0.com",
  clientId: "TU-CLIENT-ID",
  audience: "https://panel-admin.99copias.api",
  redirectUri: window.location.origin + "/pedidos.html",
};
