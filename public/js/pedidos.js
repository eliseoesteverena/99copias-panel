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
  cargarLista().then(abrirPedidoDesdeUrl);
  cargarBannerComprobantes();

  document.getElementById('btn-toggle-filtros').addEventListener('click', () => {
    const panel = document.getElementById('filtros-panel');
    const boton = document.getElementById('btn-toggle-filtros');
    const abierto = !panel.classList.contains('oculto');
    panel.classList.toggle('oculto', abierto);
    boton.setAttribute('aria-expanded', String(!abierto));
    boton.classList.toggle('activo', !abierto);
  });

  document.getElementById('f-buscar').addEventListener('input', () => {
    clearTimeout(debounceBusqueda);
    debounceBusqueda = setTimeout(() => {
      cargarLista();
      actualizarFiltrosUI();
    }, 300);
  });
  ['f-estado', 'f-pagado', 'f-zona', 'f-categoria', 'f-envio', 'f-comprobante-pendiente', 'f-fecha-desde', 'f-fecha-hasta'].forEach((id) => {
    document.getElementById(id).addEventListener('change', () => {
      cargarLista();
      actualizarFiltrosUI();
    });
  });
  document.getElementById('btn-limpiar-filtros').addEventListener('click', () => {
    document.getElementById('f-buscar').value = '';
    document.getElementById('f-estado').value = '';
    document.getElementById('f-pagado').value = '';
    document.getElementById('f-zona').value = '';
    document.getElementById('f-categoria').value = '';
    document.getElementById('f-envio').value = '';
    document.getElementById('f-comprobante-pendiente').checked = false;
    document.getElementById('f-fecha-desde').value = '';
    document.getElementById('f-fecha-hasta').value = '';
    cargarLista();
    actualizarFiltrosUI();
  });
  document.getElementById('banner-comprobantes').addEventListener('click', () => {
    document.getElementById('f-comprobante-pendiente').checked = true;
    document.getElementById('filtros-panel').classList.remove('oculto');
    document.getElementById('btn-toggle-filtros').classList.add('activo');
    cargarLista();
    actualizarFiltrosUI();
  });

  actualizarFiltrosUI();
});

// Cuenta cuántos comprobantes de transferencia están esperando revisión y
// muestra el banner si hay alguno — independiente de los filtros actuales
// de la lista, para que no se pierda de vista aunque se esté mirando otra
// cosa.
async function cargarBannerComprobantes() {
  const banner = document.getElementById('banner-comprobantes');
  try {
    const data = await api.get('/api/pagos/pendientes');
    const cantidad = (data.pendientes || []).length;
    if (cantidad === 0) {
      banner.classList.add('oculto');
      return;
    }
    banner.textContent = `📋 ${cantidad} ${cantidad === 1 ? 'comprobante esperando' : 'comprobantes esperando'} revisión`;
    banner.classList.remove('oculto');
  } catch (e) {
    // si falla, no mostramos el banner — no es crítico para el resto del panel
  }
}

// Devuelve los filtros actualmente activos, leyendo directo del DOM (así
// el label de cada chip siempre coincide con lo que el select muestra,
// sin tener que mantener un mapeo de ids a nombres por separado).
function filtrosActivos() {
  const activos = [];
  const buscar = document.getElementById('f-buscar').value.trim();
  if (buscar) {
    activos.push({ label: `"${buscar}"`, limpiar: () => (document.getElementById('f-buscar').value = '') });
  }
  [
    ['f-estado', 'Estado'],
    ['f-pagado', null],
    ['f-envio', null],
    ['f-zona', 'Zona'],
    ['f-categoria', 'Categoría'],
  ].forEach(([id, prefijo]) => {
    const el = document.getElementById(id);
    if (el.value !== '') {
      const texto = el.options[el.selectedIndex].textContent;
      activos.push({ label: prefijo ? `${prefijo}: ${texto}` : texto, limpiar: () => (el.value = '') });
    }
  });
  const desde = document.getElementById('f-fecha-desde').value;
  const hasta = document.getElementById('f-fecha-hasta').value;
  if (document.getElementById('f-comprobante-pendiente').checked) {
    activos.push({
      label: 'Con comprobante pendiente',
      limpiar: () => (document.getElementById('f-comprobante-pendiente').checked = false),
    });
  }
  if (desde || hasta) {
    activos.push({
      label: `Entrega: ${desde ? fmtFecha(desde) : '…'} – ${hasta ? fmtFecha(hasta) : '…'}`,
      limpiar: () => {
        document.getElementById('f-fecha-desde').value = '';
        document.getElementById('f-fecha-hasta').value = '';
      },
    });
  }
  return activos;
}

// Sincroniza el contador del botón "Filtros" y los chips removibles con el
// estado actual de los controles.
function actualizarFiltrosUI() {
  const activos = filtrosActivos();
  const contador = document.getElementById('filtros-contador');
  contador.textContent = activos.length;
  contador.classList.toggle('oculto', activos.length === 0);

  const contenedor = document.getElementById('chips-activos');
  if (activos.length === 0) {
    contenedor.classList.add('oculto');
    contenedor.innerHTML = '';
    return;
  }
  contenedor.classList.remove('oculto');
  contenedor.innerHTML = activos
    .map(
      (f, i) => `
    <button type="button" class="chip" data-chip="${i}">
      ${escapeHtml(f.label)}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>
    </button>`
    )
    .join('');
  contenedor.querySelectorAll('[data-chip]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activos[Number(btn.dataset.chip)].limpiar();
      cargarLista();
      actualizarFiltrosUI();
    });
  });
}

// Si la notificación push trae ?pedido=ID (o alguien comparte el link
// directo a un pedido), lo seleccionamos automáticamente al cargar.
function abrirPedidoDesdeUrl() {
  const params = new URLSearchParams(location.search);
  const pedidoId = params.get('pedido');
  if (pedidoId) seleccionarPedido(Number(pedidoId));
}

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
  const envio = document.getElementById('f-envio').value;
  const comprobantePendiente = document.getElementById('f-comprobante-pendiente').checked;
  const desde = document.getElementById('f-fecha-desde').value;
  const hasta = document.getElementById('f-fecha-hasta').value;

  if (q) params.set('q', q);
  if (estado) params.set('estado', estado);
  if (pagado !== '') params.set('pagado', pagado);
  if (zona) params.set('zona_id', zona);
  if (categoria) params.set('categoria_id', categoria);
  if (envio !== '') params.set('con_envio', envio);
  if (comprobantePendiente) params.set('comprobante_pendiente', '1');
  if (desde) params.set('fecha_desde', desde);
  if (hasta) params.set('fecha_hasta', hasta);
  return params.toString();
}

// ---------- Lista ----------
async function cargarLista() {
  const contenedor = document.getElementById('lista-pedidos');
  const estadoMsg = document.getElementById('lista-estado');
  estadoMsg.className = 'mensaje oculto';
  contenedor.innerHTML = '<div class="cargando lista-cargando">Cargando…</div>';

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
      const nombre = t.nombre ? `${escapeHtml(t.nombre)} ${escapeHtml(t.apellido)}` : 'Sin datos de contacto';
      return `
        <button class="pedido-item ${seleccionado}" data-id="${t.id}">
          <div class="pedido-item-top">
            <span class="pedido-item-cliente">${nombre}</span>
            <span class="pedido-item-id">#${t.id}</span>
          </div>
          <div class="pedido-item-meta">
            <span>${fmtFecha(t.fecha_entrega)} · ${t.zona_nombre ? escapeHtml(t.zona_nombre) : 'sin zona'}</span>
            <span class="num">${fmtMoneda(t.total)}</span>
          </div>
          <div class="pedido-item-badges">
            <span class="badge badge-${t.estado}">${ESTADOS_LABEL[t.estado] || t.estado}</span>
            <span class="badge ${t.pagado ? 'badge-pagado' : 'badge-no-pagado'}">${t.pagado ? 'Pagado' : 'No pagado'}</span>
            ${t.categoria_nombre ? `<span class="badge">${escapeHtml(t.categoria_nombre)}</span>` : ''}
            <span class="badge">${t.con_envio ? '🚚 Envío' : '🏠 Retiro'}</span>
            <span class="badge">${t.archivos_count} arch.</span>
            ${t.tiene_error_archivos ? '<span class="badge badge-error">⚠ archivo con error</span>' : ''}
            ${t.comprobante_pendiente ? '<span class="badge badge-error">📋 Comprobante pendiente</span>' : ''}
            ${t.mensajes_sin_leer > 0 ? `<span class="badge badge-info">💬 ${t.mensajes_sin_leer}</span>` : ''}
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
    const [data, mensajesData] = await Promise.all([
      api.get(`/api/trabajos/${id}`),
      api.get(`/api/mensajes?trabajo_id=${id}`).catch(() => ({ mensajes: [] })),
    ]);
    renderDetalle(data, mensajesData.mensajes || []);
    // el GET de mensajes marca como leídos los del cliente — refrescamos la
    // lista para que el badge de "sin leer" de este pedido desaparezca.
    cargarLista();
  } catch (e) {
    col.innerHTML = `<div class="mensaje error">No se pudo cargar el pedido: ${e.message}</div>`;
  }
}

function renderDetalle(data, mensajes) {
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

  const nombreCompleto = t.nombre ? `${escapeHtml(t.nombre)} ${escapeHtml(t.apellido)}` : 'Sin datos de contacto';

  col.innerHTML = `
    <div class="detalle-header">
      <div>
        <h1>Pedido #${t.id} — ${nombreCompleto}</h1>
        <div class="detalle-cliente-info">
          ${t.documento_tipo ? t.documento_tipo.toUpperCase() : 'Sin documento'} ${escapeHtml(t.documento_numero || '')}
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
          <dt>Modalidad</dt><dd>${t.con_envio ? '🚚 Envío' : '🏠 Retiro en local'}</dd>
          <dt>Dirección</dt><dd>${escapeHtml(t.direccion_entrega || '—')}</dd>
          <dt>Zona</dt><dd>${escapeHtml(t.zona_nombre || '—')}</dd>
          <dt>Turno</dt><dd>${turnoTexto}</dd>
          <dt>Fecha entrega</dt><dd>${fmtFecha(t.fecha_entrega)}</dd>
          ${
            t.con_envio
              ? `<dt>Costo de envío</dt><dd>${fmtMoneda(t.costo_envio)}${
                  t.zona_precio_envio_actual !== undefined && t.zona_precio_envio_actual !== t.costo_envio
                    ? ` <span class="nota-inline">(precio actual de la zona: ${fmtMoneda(t.zona_precio_envio_actual)} — este pedido quedó congelado al costo de cuando se hizo)</span>`
                    : ''
                }</dd>`
              : ''
          }
        </dl>
      </div>
      <div class="detalle-bloque">
        <h2>Pedido</h2>
        <dl>
          <dt>Categoría</dt><dd>${escapeHtml(t.categoria_nombre || '—')}</dd>
          <dt>Creado</dt><dd>${fmtFechaHora(t.creado_en)}</dd>
          <dt>Actualizado</dt><dd>${fmtFechaHora(t.actualizado_en)}</dd>
          ${
            t.con_envio && t.costo_envio > 0
              ? `<dt>Subtotal impresión</dt><dd>${fmtMoneda(t.total - t.costo_envio)}</dd>
                 <dt>Envío</dt><dd>${fmtMoneda(t.costo_envio)}</dd>`
              : ''
          }
          <dt>Total</dt><dd>${fmtMoneda(t.total)}</dd>
          <dt>Observaciones</dt><dd>${escapeHtml(t.observaciones || '—')}</dd>
        </dl>
      </div>
    </div>

    <h2 class="detalle-subtitulo">Archivos (${archivos.length})</h2>
    <div class="archivos-header">
      <span class="archivos-header-nota">
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

    <h2 class="detalle-subtitulo">Pagos</h2>
    ${
      pagos.length === 0
        ? '<div class="vacio vacio-chico">Sin pagos registrados todavía.</div>'
        : `<table class="pagos-tabla">
            <thead><tr><th>Fecha</th><th>Medio</th><th>Estado</th><th>Detalle</th><th class="num">Monto</th></tr></thead>
            <tbody>
              ${pagos
                .map(
                  (p) => `<tr>
                    <td>${fmtFechaHora(p.creado_en)}</td>
                    <td>${p.medio === 'transferencia' ? 'Transferencia' : 'Mercado Pago'}</td>
                    <td>${p.medio === 'transferencia' ? escapeHtml(p.estado_revision || '—') : escapeHtml(p.mp_status || '—')}</td>
                    <td>${escapeHtml(p.medio === 'transferencia' ? p.motivo_rechazo || '—' : p.mp_status_detail || '—')}</td>
                    <td class="num">${fmtMoneda(p.monto)}</td>
                  </tr>`
                )
                .join('')}
            </tbody>
          </table>`
    }
    ${pagos.filter((p) => p.medio === 'transferencia').map((p) => comprobanteCardHtml(p)).join('')}

    <h2 class="detalle-subtitulo">Mensajes</h2>
    <div class="mensajes-hilo" id="mensajes-hilo">
      ${
        mensajes.length === 0
          ? '<div class="vacio vacio-chico">Todavía no hay mensajes en este pedido.</div>'
          : mensajes.map((m) => mensajeBurbujaHtml(m)).join('')
      }
    </div>
    <form id="form-mensaje" class="mensaje-form">
      <textarea id="mensaje-texto" placeholder="Escribir un mensaje para el cliente…" rows="2"></textarea>
      <button type="submit" class="primario chico">Enviar</button>
    </form>
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

  // comprobante: aprobar/rechazar
  document.querySelectorAll('[data-aprobar-comprobante]').forEach((btn) => {
    btn.addEventListener('click', () => revisarComprobante(t.id, Number(btn.dataset.aprobarComprobante), true));
  });
  document.querySelectorAll('[data-rechazar-comprobante]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const motivo = prompt('Motivo del rechazo (se lo va a ver el cliente):');
      if (motivo === null) return; // canceló el prompt
      if (!motivo.trim()) {
        alert('El motivo de rechazo no puede quedar vacío.');
        return;
      }
      revisarComprobante(t.id, Number(btn.dataset.rechazarComprobante), false, motivo.trim());
    });
  });

  // mensajes: enviar
  const formMensaje = document.getElementById('form-mensaje');
  if (formMensaje) {
    formMensaje.addEventListener('submit', (e) => {
      e.preventDefault();
      enviarMensaje(t.id);
    });
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

// Arma la config de impresión como una frase legible en vez de una grilla
// de campos — "ByN A4 · Simple faz · 2 copias · Abrochado". Solo suma un
// dato a la frase si aporta algo (ej. "1 página/carilla" no se muestra
// porque es el valor por defecto y no dice nada nuevo).
function resumenConfiguracion(archivo, item) {
  const partes = [];

  const nombreProductoPrimario =
    item && item.producto_primario_id != null
      ? productosPorId[item.producto_primario_id]?.descripcion || `Producto #${item.producto_primario_id}`
      : null;
  if (nombreProductoPrimario) partes.push(nombreProductoPrimario);

  const faz = FAZ_LABEL[archivo.faz] || archivo.faz;
  if (faz) partes.push(faz);

  const paginasPorCarilla = archivo.paginas_por_carilla || 1;
  if (paginasPorCarilla > 1) partes.push(`${paginasPorCarilla} páginas/carilla`);

  if (archivo.copias) partes.push(`${archivo.copias} ${Number(archivo.copias) === 1 ? 'copia' : 'copias'}`);

  const acabado = (item && item.producto_secundario) || archivo.acabado;
  if (acabado) partes.push(acabado);

  if (archivo.rango && String(archivo.rango).trim()) partes.push(`págs. ${archivo.rango}`);

  return partes.join(' · ') || 'Sin configuración de impresión';
}

function archivoCardHtml(trabajoId, archivo, item) {
  const tieneError = !!archivo.error_confirmacion;
  const ext = (archivo.nombre || '').split('.').pop().toLowerCase();
  let claseIcono = 'doc';
  let etiquetaIcono = ext.slice(0, 3) || '?';
  if (ext === 'pdf') claseIcono = 'pdf';
  else if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) claseIcono = 'img';

  const tituloPrecio = item
    ? `${item.producto_primario_id != null ? productosPorId[item.producto_primario_id]?.descripcion || 'Producto 1º' : 'Producto 1º'}: ${fmtMoneda(item.subtotal_primario)}${item.producto_secundario ? ` + ${item.producto_secundario}: ${fmtMoneda(item.subtotal_secundario)}` : ''}`
    : '';

  return `
    <div class="archivo-fila ${tieneError ? 'con-error' : ''}">
      <div class="archivo-icono ${claseIcono}">${escapeHtml(etiquetaIcono)}</div>
      <div class="archivo-cuerpo">
        <div class="archivo-linea-top">
          <span class="archivo-nombre">${escapeHtml(archivo.nombre)}</span>
          ${item ? `<span class="archivo-total" title="${escapeHtml(tituloPrecio)}">${fmtMoneda(item.total)}</span>` : ''}
        </div>
        <div class="archivo-linea-config">
          ${archivo.paginas ? `${archivo.paginas} pág. · ` : ''}${escapeHtml(resumenConfiguracion(archivo, item))}
        </div>
        ${tieneError ? `<div class="archivo-error">⚠ ${escapeHtml(archivo.error_confirmacion)}</div>` : ''}
        <div class="archivo-acciones">
          ${
            archivo.r2_key
              ? `<button class="chico fantasma archivo-abrir" data-key="${escapeHtml(archivo.r2_key)}">Abrir</button>
                 <button class="chico fantasma archivo-descargar" data-key="${escapeHtml(archivo.r2_key)}">Descargar</button>`
              : '<span class="archivo-no-disponible">No disponible en el bucket</span>'
          }
        </div>
      </div>
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
    const resultado = await api.patch(`/api/trabajos/${id}`, { estado });
    await seleccionarPedido(id);
    await cargarLista();
    if (resultado.avisoWizard === false) {
      alert(
        `El estado se guardó bien, pero no se pudo avisar al wizard para notificar al cliente ` +
          `(${resultado.avisoWizardError || 'error desconocido'}). El cliente puede no enterarse de este cambio.`
      );
    }
  } catch (e) {
    alert(`No se pudo cambiar el estado: ${e.message}`);
  }
}

// ---------- Comprobantes de transferencia ----------

const ESTADO_REVISION_LABEL = { pendiente: 'Pendiente de revisión', aprobado: 'Aprobado', rechazado: 'Rechazado' };

function comprobanteCardHtml(pago) {
  const ext = (pago.comprobante_r2_key || '').split('.').pop().toLowerCase();
  const esImagen = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext);
  const urlComprobante = `/api/pagos/comprobante?pago_id=${pago.id}`;
  const estado = pago.estado_revision || 'pendiente';

  return `
    <div class="comprobante-card">
      <div class="comprobante-preview">
        ${
          pago.comprobante_r2_key
            ? esImagen
              ? `<a href="${urlComprobante}" target="_blank"><img src="${urlComprobante}" alt="Comprobante de transferencia"></a>`
              : `<a href="${urlComprobante}" target="_blank" class="comprobante-link-pdf">📄 Ver comprobante (PDF)</a>`
            : '<span class="nota-inline">Sin comprobante adjunto todavía</span>'
        }
      </div>
      <div class="comprobante-info">
        <div class="comprobante-titulo">
          Comprobante de transferencia
          <span class="badge ${estado === 'aprobado' ? 'badge-pagado' : estado === 'rechazado' ? 'badge-no-pagado' : 'badge-pendiente'}">
            ${ESTADO_REVISION_LABEL[estado] || estado}
          </span>
        </div>
        ${pago.motivo_rechazo ? `<div class="nota-inline">Motivo de rechazo: ${escapeHtml(pago.motivo_rechazo)}</div>` : ''}
        ${
          estado === 'pendiente'
            ? `<div class="comprobante-acciones">
                <button class="chico primario" data-aprobar-comprobante="${pago.id}">Aprobar</button>
                <button class="chico peligro" data-rechazar-comprobante="${pago.id}">Rechazar</button>
              </div>`
            : ''
        }
      </div>
    </div>
  `;
}

async function revisarComprobante(trabajoId, pagoId, aprobado, motivoRechazo) {
  try {
    await api.patch(`/api/pagos/${pagoId}`, { aprobado, motivo_rechazo: motivoRechazo });
    await seleccionarPedido(trabajoId);
    await cargarLista();
    cargarBannerComprobantes();
  } catch (e) {
    alert(`No se pudo procesar la revisión: ${e.message}`);
  }
}

// ---------- Mensajes ----------

function mensajeBurbujaHtml(m) {
  const esOperador = m.autor === 'operador';
  return `
    <div class="mensaje-burbuja ${esOperador ? 'es-operador' : 'es-cliente'}">
      <div class="mensaje-burbuja-autor">${esOperador ? 'Vos' : 'Cliente'}</div>
      <div class="mensaje-burbuja-texto">${escapeHtml(m.mensaje)}</div>
      <div class="mensaje-burbuja-fecha">${fmtFechaHora(m.creado_en)}</div>
    </div>
  `;
}

async function enviarMensaje(trabajoId) {
  const textarea = document.getElementById('mensaje-texto');
  const mensaje = textarea.value.trim();
  if (!mensaje) return;

  const boton = document.querySelector('#form-mensaje button');
  boton.disabled = true;
  try {
    await api.post('/api/mensajes', { trabajo_id: trabajoId, mensaje });
    await seleccionarPedido(trabajoId);
  } catch (e) {
    alert(`No se pudo enviar el mensaje: ${e.message}`);
  } finally {
    boton.disabled = false;
  }
}
