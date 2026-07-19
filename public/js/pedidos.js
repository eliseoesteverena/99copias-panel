// ---------- Estado ----------
let pedidoSeleccionadoId = null;
let debounceBusqueda = null;
let productosPorId = {}; // id -> { descripcion, unidad_medida }

const FAZ_LABEL = { simple: 'Simple faz', doble: 'Doble faz' };

const ESTADOS_ORDEN = ['pendiente', 'en_proceso', 'listo', 'entregado'];
const ESTADOS_LABEL = {
  pendiente: 'Pendiente',
  en_proceso: 'En proceso',
  listo: 'Listo',
  entregado: 'Entregado',
};

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  cargarZonasFiltro();
  cargarCategoriasFiltro();
  cargarProductosCache();
  cargarLista();

  document.getElementById('f-buscar').addEventListener('input', () => {
    clearTimeout(debounceBusqueda);
    debounceBusqueda = setTimeout(cargarLista, 300);
  });
  ['f-estado', 'f-pagado', 'f-zona', 'f-categoria', 'f-fecha-desde', 'f-fecha-hasta'].forEach((id) => {
    document.getElementById(id).addEventListener('change', cargarLista);
  });
  document.getElementById('btn-limpiar-filtros').addEventListener('click', () => {
    document.getElementById('f-buscar').value = '';
    document.getElementById('f-estado').value = '';
    document.getElementById('f-pagado').value = '';
    document.getElementById('f-zona').value = '';
    document.getElementById('f-categoria').value = '';
    document.getElementById('f-fecha-desde').value = '';
    document.getElementById('f-fecha-hasta').value = '';
    cargarLista();
  });
});

async function cargarZonasFiltro() {
  try {
    const data = await api.get('/api/zonas');
    const select = document.getElementById('f-zona');
    (data.zonas || []).forEach((z) => {
      const opt = document.createElement('option');
      opt.value = z.id;
      opt.textContent = z.nombre;
      select.appendChild(opt);
    });
  } catch (e) {
    // el filtro de zona simplemente no se completa, no es crítico
  }
}

async function cargarCategoriasFiltro() {
  try {
    const data = await api.get('/api/categorias');
    const select = document.getElementById('f-categoria');
    (data.categorias || []).forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.nombre;
      select.appendChild(opt);
    });
  } catch (e) {
    // el filtro de categoría simplemente no se completa, no es crítico
  }
}

async function cargarProductosCache() {
  try {
    const data = await api.get('/api/productos');
    productosPorId = {};
    (data.productos || []).forEach((p) => {
      productosPorId[p.id] = p;
    });
  } catch (e) {
    // si falla, los cards de archivo muestran "Producto #id" como respaldo
  }
}

function construirQuery() {
  const params = new URLSearchParams();
  const q = document.getElementById('f-buscar').value.trim();
  const estado = document.getElementById('f-estado').value;
  const pagado = document.getElementById('f-pagado').value;
  const zona = document.getElementById('f-zona').value;
  const categoria = document.getElementById('f-categoria').value;
  const desde = document.getElementById('f-fecha-desde').value;
  const hasta = document.getElementById('f-fecha-hasta').value;

  if (q) params.set('q', q);
  if (estado) params.set('estado', estado);
  if (pagado !== '') params.set('pagado', pagado);
  if (zona) params.set('zona_id', zona);
  if (categoria) params.set('categoria_id', categoria);
  if (desde) params.set('fecha_desde', desde);
  if (hasta) params.set('fecha_hasta', hasta);
  return params.toString();
}

// ---------- Lista ----------
async function cargarLista() {
  const contenedor = document.getElementById('lista-pedidos');
  const estadoMsg = document.getElementById('lista-estado');
  estadoMsg.className = 'mensaje oculto';
  contenedor.innerHTML = '<div class="cargando" style="padding:14px;">Cargando…</div>';

  try {
    const query = construirQuery();
    const data = await api.get(`/api/trabajos${query ? '?' + query : ''}`);
    renderLista(data.trabajos || []);
  } catch (e) {
    estadoMsg.className = 'mensaje error';
    estadoMsg.textContent = `No se pudo cargar la lista: ${e.message}`;
    contenedor.innerHTML = '';
  }
}

function renderLista(trabajos) {
  const contenedor = document.getElementById('lista-pedidos');
  if (trabajos.length === 0) {
    contenedor.innerHTML = '<div class="vacio">No hay pedidos con estos filtros.</div>';
    return;
  }

  contenedor.innerHTML = trabajos
    .map((t) => {
      const seleccionado = t.id === pedidoSeleccionadoId ? 'seleccionado' : '';
      const nombre = `${escapeHtml(t.nombre)} ${escapeHtml(t.apellido)}`;
      return `
        <button class="pedido-item ${seleccionado}" data-id="${t.id}">
          <div class="pedido-item-top">
            <span class="pedido-item-cliente">${nombre}</span>
            <span class="pedido-item-id">#${t.id}</span>
          </div>
          <div class="pedido-item-meta">
            <span>${fmtFecha(t.fecha_entrega)} · ${t.zona_nombre ? escapeHtml(t.zona_nombre) : 'sin zona'}</span>
            <span>${fmtMoneda(t.total)}</span>
          </div>
          <div class="pedido-item-badges">
            <span class="badge badge-${t.estado}">${ESTADOS_LABEL[t.estado] || t.estado}</span>
            <span class="badge ${t.pagado ? 'badge-pagado' : 'badge-no-pagado'}">${t.pagado ? 'Pagado' : 'No pagado'}</span>
            ${t.categoria_nombre ? `<span class="badge">${escapeHtml(t.categoria_nombre)}</span>` : ''}
            <span class="badge">${t.archivos_count} arch.</span>
            ${t.tiene_error_archivos ? '<span class="badge badge-error">⚠ archivo con error</span>' : ''}
          </div>
        </button>
      `;
    })
    .join('');

  contenedor.querySelectorAll('.pedido-item').forEach((btn) => {
    btn.addEventListener('click', () => seleccionarPedido(Number(btn.dataset.id)));
  });
}

// ---------- Detalle ----------
async function seleccionarPedido(id) {
  pedidoSeleccionadoId = id;
  document.querySelectorAll('.pedido-item').forEach((btn) => {
    btn.classList.toggle('seleccionado', Number(btn.dataset.id) === id);
  });

  const col = document.getElementById('detalle-col');
  col.innerHTML = '<div class="cargando">Cargando pedido…</div>';

  try {
    const data = await api.get(`/api/trabajos/${id}`);
    renderDetalle(data);
  } catch (e) {
    col.innerHTML = `<div class="mensaje error">No se pudo cargar el pedido: ${e.message}</div>`;
  }
}

function renderDetalle(data) {
  const { trabajo: t, archivos, items, pagos } = data;
  const col = document.getElementById('detalle-col');

  const botonesEstado = ESTADOS_ORDEN.map((estado) => {
    const activo = estado === t.estado ? 'primario' : '';
    return `<button class="chico ${activo}" data-estado="${estado}">${ESTADOS_LABEL[estado]}</button>`;
  }).join('');

  const turnoTexto =
    t.dia_semana !== null && t.dia_semana !== undefined
      ? `${DIAS[t.dia_semana]} ${t.hora_inicio || ''}–${t.hora_fin || ''}`
      : '—';

  col.innerHTML = `
    <div class="detalle-header">
      <div>
        <h1>Pedido #${t.id} — ${escapeHtml(t.nombre)} ${escapeHtml(t.apellido)}</h1>
        <div class="detalle-cliente-info">
          ${t.documento_tipo.toUpperCase()} ${escapeHtml(t.documento_numero)}
          ${t.email ? ' · ' + escapeHtml(t.email) : ''}
          ${t.celular ? ' · ' + escapeHtml(t.celular) : ''}
        </div>
      </div>
      <div class="detalle-estado-acciones">
        <span class="badge ${t.pagado ? 'badge-pagado' : 'badge-no-pagado'}">${t.pagado ? 'Pagado' : 'No pagado'}</span>
        <div class="detalle-estado-botones" id="botones-estado">${botonesEstado}</div>
      </div>
    </div>

    <div class="detalle-grid">
      <div class="detalle-bloque">
        <h2>Entrega</h2>
        <dl>
          <dt>Dirección</dt><dd>${escapeHtml(t.direccion_entrega || t.cliente_direccion || '—')}</dd>
          <dt>Zona</dt><dd>${escapeHtml(t.zona_nombre || '—')}</dd>
          <dt>Turno</dt><dd>${turnoTexto}</dd>
          <dt>Fecha entrega</dt><dd>${fmtFecha(t.fecha_entrega)}</dd>
        </dl>
      </div>
      <div class="detalle-bloque">
        <h2>Pedido</h2>
        <dl>
          <dt>Categoría</dt><dd>${escapeHtml(t.categoria_nombre || '—')}</dd>
          <dt>Creado</dt><dd>${fmtFechaHora(t.creado_en)}</dd>
          <dt>Actualizado</dt><dd>${fmtFechaHora(t.actualizado_en)}</dd>
          <dt>Total</dt><dd>${fmtMoneda(t.total)}</dd>
          <dt>Observaciones</dt><dd>${escapeHtml(t.observaciones || '—')}</dd>
        </dl>
      </div>
    </div>

    <h2>Archivos (${archivos.length})</h2>
    <div class="archivos-header">
      <span class="cargando" style="font-style:normal;color:var(--gris-texto);font-size:12px;">
        ${archivos.length === 0 ? 'Este pedido no tiene archivos.' : 'Clic en un archivo para abrirlo individualmente.'}
      </span>
      <div class="archivos-acciones-grupales">
        <button class="chico" id="btn-abrir-todos" ${archivos.length === 0 ? 'disabled' : ''}>Abrir todos (pestañas)</button>
        <button class="chico acento" id="btn-descargar-zip" ${archivos.length === 0 ? 'disabled' : ''}>Descargar todos (.zip)</button>
      </div>
    </div>
    <div class="archivos-grid" id="archivos-grid">
      ${archivos.map((a, i) => archivoCardHtml(t.id, a, emparejarItem(a, items, i))).join('')}
    </div>
    <div class="archivos-total">Total del pedido: <strong>${fmtMoneda(t.total)}</strong></div>

    <h2 style="margin-top:24px;">Pagos</h2>
    ${
      pagos.length === 0
        ? '<div class="vacio" style="padding:14px 0;">Sin pagos registrados todavía.</div>'
        : `<table class="pagos-tabla">
            <thead><tr><th>Fecha</th><th>Estado MP</th><th>Detalle</th><th>Tipo</th><th class="num">Monto</th></tr></thead>
            <tbody>
              ${pagos
                .map(
                  (p) => `<tr>
                    <td>${fmtFechaHora(p.creado_en)}</td>
                    <td>${escapeHtml(p.mp_status || '—')}</td>
                    <td>${escapeHtml(p.mp_status_detail || '—')}</td>
                    <td>${escapeHtml(p.mp_payment_type || '—')}</td>
                    <td class="num">${fmtMoneda(p.monto)}</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>`
    }
  `;

  // eventos de cambio de estado
  document.querySelectorAll('#botones-estado button').forEach((btn) => {
    btn.addEventListener('click', () => cambiarEstado(t.id, btn.dataset.estado));
  });

  // eventos de archivos individuales
  document.querySelectorAll('.archivo-abrir').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.open(urlArchivo(t.id, btn.dataset.key, false), '_blank');
    });
  });
  document.querySelectorAll('.archivo-descargar').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.open(urlArchivo(t.id, btn.dataset.key, true), '_blank');
    });
  });

  // acciones grupales
  const btnAbrirTodos = document.getElementById('btn-abrir-todos');
  if (btnAbrirTodos) {
    btnAbrirTodos.addEventListener('click', () => {
      archivos.forEach((a) => {
        if (a.r2_key) window.open(urlArchivo(t.id, a.r2_key, false), '_blank');
      });
    });
  }
  const btnZip = document.getElementById('btn-descargar-zip');
  if (btnZip) {
    btnZip.addEventListener('click', () => descargarZip(t.id, archivos, btnZip));
  }
}

// Empareja cada archivo con su item de precio correspondiente. Primero
// intenta por nombre exacto (lo normal); si hay nombres duplicados o no
// matchea, cae al mismo índice como respaldo.
function emparejarItem(archivo, items, indice) {
  const porNombre = items.find((it) => it.nombre === archivo.nombre);
  if (porNombre) return porNombre;
  return items[indice] || null;
}

function archivoCardHtml(trabajoId, archivo, item) {
  const tieneError = !!archivo.error_confirmacion;
  const ext = (archivo.nombre || '').split('.').pop().toLowerCase();
  let claseIcono = 'doc';
  let etiquetaIcono = ext.slice(0, 3) || '?';
  if (ext === 'pdf') claseIcono = 'pdf';
  else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) claseIcono = 'img';

  // Config de impresión tal cual la pidió el cliente. Se muestra completa
  // acá (en la card de cada archivo) en vez de como columnas de una tabla
  // general, porque no todos los archivos comparten los mismos campos y una
  // tabla con una columna por dato se vuelve ilegible.
  const configFilas = [
    ['Páginas', archivo.paginas ?? '—'],
    ['Copias', archivo.copias ?? '—'],
    ['Faz', FAZ_LABEL[archivo.faz] || archivo.faz || '—'],
    ['Rango', archivo.rango && String(archivo.rango).trim() ? archivo.rango : 'Completo'],
    ['Acabado', archivo.acabado || '—'],
  ];

  let bloquePrecio = '';
  if (item) {
    const nombreProductoPrimario =
      item.producto_primario_id != null
        ? productosPorId[item.producto_primario_id]?.descripcion || `Producto #${item.producto_primario_id}`
        : 'Producto 1º';
    const nombreProductoSecundario = item.producto_secundario || 'Producto 2º';

    bloquePrecio = `
      <dl class="archivo-col archivo-precio">
        <dt>${escapeHtml(nombreProductoPrimario)}</dt><dd class="num">${fmtMoneda(item.subtotal_primario)}</dd>
        <dt>${escapeHtml(nombreProductoSecundario)}</dt><dd class="num">${fmtMoneda(item.subtotal_secundario)}</dd>
        <dt class="archivo-precio-total-label">Total</dt><dd class="num archivo-precio-total-valor">${fmtMoneda(item.total)}</dd>
      </dl>
    `;
  }

  return `
    <div class="archivo-card ${tieneError ? 'con-error' : ''}">
      <div class="archivo-miniatura ${claseIcono}">${escapeHtml(etiquetaIcono)}</div>
      <div class="archivo-col archivo-col-info">
        <div class="archivo-nombre">${escapeHtml(archivo.nombre)}</div>
        ${tieneError ? `<div class="mensaje error" style="padding:4px 6px;font-size:11px;margin:4px 0;">⚠ ${escapeHtml(archivo.error_confirmacion)}</div>` : ''}
        ${
          archivo.r2_key
            ? `<div class="archivo-acciones">
                <button class="chico archivo-abrir" data-key="${escapeHtml(archivo.r2_key)}">Abrir</button>
                <button class="chico archivo-descargar" data-key="${escapeHtml(archivo.r2_key)}">Descargar</button>
              </div>`
            : '<div class="archivo-acciones" style="color:var(--rojo);font-size:11px;">No disponible en el bucket</div>'
        }
      </div>
      <dl class="archivo-col archivo-config">
        ${configFilas.map(([k, v]) => `<dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd>`).join('')}
      </dl>
      ${bloquePrecio}
    </div>
  `;
}

function urlArchivo(trabajoId, key, forzarDescarga) {
  const params = new URLSearchParams({ trabajo_id: trabajoId, key });
  if (forzarDescarga) params.set('dl', '1');
  return `/api/archivos?${params.toString()}`;
}

async function descargarZip(trabajoId, archivos, boton) {
  const keys = archivos.map((a) => a.r2_key).filter(Boolean);
  if (keys.length === 0) return;

  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = 'Armando .zip…';

  try {
    const res = await fetch('/api/archivos/zip', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ trabajo_id: trabajoId, keys }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Error ${res.status}`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pedido-${trabajoId}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert(`No se pudo generar el .zip: ${e.message}`);
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

async function cambiarEstado(id, estado) {
  try {
    await api.patch(`/api/trabajos/${id}`, { estado });
    await seleccionarPedido(id);
    await cargarLista();
  } catch (e) {
    alert(`No se pudo cambiar el estado: ${e.message}`);
  }
}
