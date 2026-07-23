// Compartido por las 3 páginas. Maneja:
// 1) Registro del Service Worker (requisito de instalabilidad + push).
// 2) Botón "Instalar app" (captura beforeinstallprompt; en iOS, que no
//    dispara ese evento, muestra instrucciones manuales).
// 3) Botón de notificaciones: suscribe/desuscribe al navegador para recibir
//    push de "pedido nuevo", avisando al backend en /api/push/subscribe.

// Generado con `web-push generate-vapid-keys` — es información pública,
// va sin problema en el frontend (la clave privada vive solo en el backend
// como secreto de Cloudflare, nunca acá).
const VAPID_PUBLIC_KEY = 'BBaCXcEvdFvcmXtNQHKCuMFnot4mYea38U0Fa2KoD44_srMteMvT4Py3ke8OkOTrPFWnu5sLHP7GPuQaSVQF1ds';

let promptDeInstalacion = null;

document.addEventListener('DOMContentLoaded', () => {
  registrarServiceWorker();
  inicializarBotonNotificaciones();
  inicializarBotonInstalar();
});

async function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (e) {
    console.error('No se pudo registrar el service worker:', e);
  }
}

// ---------- Notificaciones push ----------

function soportaPush() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

async function inicializarBotonNotificaciones() {
  const boton = document.getElementById('btn-notificaciones');
  if (!boton) return;

  if (!soportaPush()) {
    boton.disabled = true;
    boton.title = 'Este navegador no soporta notificaciones push';
    return;
  }

  if (Notification.permission === 'denied') {
    boton.title = 'Notificaciones bloqueadas — habilitalas desde la configuración del navegador';
    boton.disabled = true;
    return;
  }

  await actualizarEstadoBotonNotificaciones();
  boton.addEventListener('click', alternarNotificaciones);
}

async function actualizarEstadoBotonNotificaciones() {
  const boton = document.getElementById('btn-notificaciones');
  if (!boton) return;
  try {
    const registro = await navigator.serviceWorker.ready;
    const suscripcion = await registro.pushManager.getSubscription();
    const activo = !!suscripcion;
    boton.classList.toggle('activo', activo);
    boton.setAttribute('aria-pressed', String(activo));
    boton.title = activo ? 'Notificaciones activadas — click para desactivar' : 'Activar notificaciones de pedidos nuevos';
  } catch (e) {
    // si falla, dejamos el botón en su estado default sin romper la página
  }
}

async function alternarNotificaciones() {
  const boton = document.getElementById('btn-notificaciones');
  boton.disabled = true;
  try {
    const registro = await navigator.serviceWorker.ready;
    const suscripcionActual = await registro.pushManager.getSubscription();

    if (suscripcionActual) {
      await api.del('/api/push/subscribe?endpoint=' + encodeURIComponent(suscripcionActual.endpoint));
      await suscripcionActual.unsubscribe();
    } else {
      const permiso = await Notification.requestPermission();
      if (permiso !== 'granted') {
        alert('No se activaron las notificaciones: el navegador no dio permiso.');
        return;
      }
      const suscripcion = await registro.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      await api.post('/api/push/subscribe', suscripcion.toJSON());
    }
  } catch (e) {
    alert(`No se pudo actualizar la suscripción: ${e.message}`);
  } finally {
    boton.disabled = false;
    await actualizarEstadoBotonNotificaciones();
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const outputArray = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) outputArray[i] = raw.charCodeAt(i);
  return outputArray;
}

// ---------- Instalar app ----------

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  promptDeInstalacion = e;
  const boton = document.getElementById('btn-instalar');
  if (boton) boton.classList.remove('oculto');
});

function esIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}

function yaEstaInstalada() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function inicializarBotonInstalar() {
  const boton = document.getElementById('btn-instalar');
  if (!boton || yaEstaInstalada()) return;

  // iOS no dispara beforeinstallprompt — mostramos instrucciones manuales
  // en vez del botón nativo, porque ahí "instalar" es un paso manual del
  // usuario (Compartir → Agregar a inicio) que no se puede disparar por código.
  if (esIOS()) {
    boton.classList.remove('oculto');
    boton.title = 'Instalar: tocá Compartir → Agregar a pantalla de inicio';
    boton.addEventListener('click', () => {
      alert('Para instalar el panel en iPhone/iPad:\n\n1. Tocá el botón de Compartir (el cuadrado con la flecha)\n2. Elegí "Agregar a pantalla de inicio"');
    });
    return;
  }

  boton.addEventListener('click', async () => {
    if (!promptDeInstalacion) return;
    promptDeInstalacion.prompt();
    await promptDeInstalacion.userChoice;
    promptDeInstalacion = null;
    boton.classList.add('oculto');
  });
}

window.addEventListener('appinstalled', () => {
  const boton = document.getElementById('btn-instalar');
  if (boton) boton.classList.add('oculto');
});
