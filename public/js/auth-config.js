// public/js/auth-config.js
//
// Completá esto con los datos de tu Application (tipo SPA) en Auth0:
// Dashboard > Applications > tu app > Settings.
//
// audience tiene que coincidir con el "Identifier" de la API que crees en
// Auth0 Dashboard > Applications > APIs (así el access token sirve para
// llamar a /api/* y no solo para identificar al usuario).
window.AUTH0_CONFIG = {
  domain: "dev-0z2lkf1fu6a4t6wl.us.auth0.com",
  clientId: "KmR0t6SiRg0s9vftsm01ovsVeIOTChRL",
  
  useRefreshTokens: true,           // Fuerza al SDK a pedir y manejar Refresh Tokens
  
  cacheLocation: "localstorage",    // Permite guardar los tokens de forma segura fuera de la memoria volátil
  authorizationParams: {
    //audience: "https://99copias-panel.api", // Ajustado para que coincida con tu error
   // scope: "openid profile email offline_access", // Requiere offline_access explícitamente
    redirect_uri: window.location.origin + "/pedidos.html", // Nota: el SDK usa minúsculas y guion bajo (redirect_uri)
  }
};