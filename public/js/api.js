// Helper mínimo para hablar con las Pages Functions del panel.
// Todas devuelven JSON con { error: "..." } en caso de fallo, según la
// convención documentada.

async function apiFetch(url, opciones = {}) {
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json', ...(opciones.headers || {}) },
    ...opciones,
  });

  let data = null;
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const mensaje = (data && data.error) || `Error ${res.status}`;
    const err = new Error(mensaje);
    err.status = res.status;
    throw err;
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
