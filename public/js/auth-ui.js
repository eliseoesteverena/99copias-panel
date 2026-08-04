// Se carga en index.html, catalogo.html y turnos.html (las 3 páginas
// protegidas). login.html NO usa este archivo — tiene su propio flujo.
//
// A propósito esto es solo un gate de UI (oculta la página hasta confirmar
// sesión, y manda a /login.html si no hay). NO protege las Functions de
// /api/* — eso quedó así a pedido: sin verificación de token en cada
// request, solo en el login. Ver advertencia en el README.

document.addEventListener('DOMContentLoaded', async () => {
  try {
    await Auth.init(AUTH_CONFIG);
    const user = await Auth.requireAuth();
    if (!user) return; // requireAuth ya está redirigiendo a /login.html

    const overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.remove();

    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      const nombre = user.name || user.email || '';
      btnLogout.title = nombre ? `Cerrar sesión (${nombre})` : 'Cerrar sesión';
      btnLogout.addEventListener('click', () => Auth.logout());
    }
  } catch (e) {
    console.error('[Auth]', e);
    const overlay = document.getElementById('auth-overlay');
    if (overlay) {
      overlay.innerHTML =
        '<div class="auth-overlay-error">' +
        '<p>No se pudo verificar la sesión.</p>' +
        `<p class="nota-inline">${e.message ? String(e.message).replace(/</g, '&lt;') : ''}</p>` +
        '<button class="chico" onclick="location.reload()">Reintentar</button>' +
        '</div>';
    }
  }
});
