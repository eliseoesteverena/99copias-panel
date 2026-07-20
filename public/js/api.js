// Helper mínimo para hablar con las Pages Functions del panel.
// Todas devuelven JSON con { error: "..." } en caso de fallo, según la
// convención documentada.

async function apiFetch(url, opciones = {}) {
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json', ...(opciones.headers || {}) },
    ...opciones,
  });

  // Leemos como texto primero y parseamos nosotros mismos: algunos proxies o
  // errores intermedios pueden devolver un content-type raro para un body
  // que sí es JSON válido (o viceversa), así que no confiamos en el header.
  const texto = await res.text();
  let data = null;
  if (texto) {
    try {
      data = JSON.parse(texto);
    } catch {
      // body no es JSON válido — data queda null, lo manejamos más abajo
    }
  }

  if (!res.ok) {
    const detalle = data && data.error ? data.error : texto ? texto.slice(0, 300) : '';
    throw new Error(detalle || `Error ${res.status}`);
  }

  if (data === null) {
    // 2xx pero el body no es JSON válido (o vino vacío). Esto no debería
    // pasar nunca con nuestras Functions — avisamos fuerte en vez de
    // devolver null en silencio, que rompía a cualquier caller con un
    // críptico "Cannot read properties of null".
    throw new Error(
      `Respuesta inesperada del servidor (status ${res.status}, el body no es JSON válido)`
    );
  }

  return data;
}

const api = {
  get: (url) => apiFetch(url),
  post: (url, body) => apiFetch(url, { method: 'POST', body: JSON.stringify(body) }),
  put: (url, body) => apiFetch(url, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (url, body) => apiFetch(url, { method: 'PATCH', body: JSON.stringify(body) }),
  del: (url) => apiFetch(url, { method: 'DELETE' }),
};

function fmtMoneda(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n || 0);
}

function fmtFecha(iso) {
  if (!iso) return '—';
  // acepta 'YYYY-MM-DD' o timestamps 'YYYY-MM-DD HH:MM:SS'
  const soloFecha = iso.split(' ')[0].split('T')[0];
  const [y, m, d] = soloFecha.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function fmtFechaHora(iso) {
  if (!iso) return '—';
  const [fecha, hora] = iso.split(' ');
  const horaCorta = hora ? hora.slice(0, 5) : '';
  return `${fmtFecha(fecha)}${horaCorta ? ' ' + horaCorta : ''}`;
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
