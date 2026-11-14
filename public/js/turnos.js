let zonasCache = [];
let turnosCache = [];
let excepcionesCache = [];
let categoriasCache = [];
let descuentosCache = [];

document.addEventListener('DOMContentLoaded', () => {
  cargarCategorias();
  cargarTodo();

  // --- zonas ---
  document.getElementById('btn-nueva-zona').addEventListener('click', () => abrirModalZona(null));
  document.getElementById('form-zona').addEventListener('submit', guardarZona);
  document.getElementById('z-es-retiro').addEventListener('change', actualizarCampoPrecioEnvio);

  // --- turnos ---
  document.getElementById('btn-nuevo-turno').addEventListener('click', () => abrirModalTurno(null));
  document.getElementById('form-turno').addEventListener('submit', guardarTurno);
  document.getElementById('filtro-zona-turnos').addEventListener('change', renderTurnos);
  document.getElementById('t-zona-todas').addEventListener('change', (e) => {
    document.querySelectorAll('#t-zonas-lista input[type=checkbox]').forEach((cb) => (cb.checked = e.target.checked));
    actualizarResumenAltaTurnos();
  });
  document.getElementById('t-zonas-lista').addEventListener('change', () => {
    sincronizarTodasLasZonasTurno();
    actualizarResumenAltaTurnos();
  });
  document.getElementById('t-dias-lista').addEventListener('change', actualizarResumenAltaTurnos);
  document.getElementById('t-dias-lunvie').addEventListener('click', () => marcarDiasTurno([1, 2, 3, 4, 5]));
  document.getElementById('t-dias-todos').addEventListener('click', () => marcarDiasTurno([0, 1, 2, 3, 4, 5, 6]));
  document.getElementById('t-dias-ninguno').addEventListener('click', () => marcarDiasTurno([]));
  ['t-hora-inicio', 't-hora-fin'].forEach((id) =>
    document.getElementById(id).addEventListener('input', actualizarResumenAltaTurnos)
  );

  // --- excepciones ---
  document.getElementById('btn-nueva-excepcion').addEventListener('click', abrirModalExcepcion);
  document.getElementById('btn-cancelar-fechas').addEventListener('click', abrirModalCancelacion);
  document.getElementById('form-cancelacion').addEventListener('submit', revisarCancelacion);
  document.getElementById('c-volver').addEventListener('click', volverACancelacion);
  document.getElementById('c-confirmar').addEventListener('click', confirmarCancelacion);
  document.getElementById('c-zona-todas').addEventListener('change', (e) => {
    document.querySelectorAll('#c-zonas-lista input[type=checkbox]').forEach((cb) => (cb.checked = e.target.checked));
  });
  document.getElementById('c-zonas-lista').addEventListener('change', sincronizarTodasLasZonas);
  document.getElementById('form-excepcion').addEventListener('submit', guardarExcepcion);
  document.getElementById('e-tipo').addEventListener('change', actualizarCamposExcepcion);

  // --- descuentos de envío ---
  document.getElementById('btn-nuevo-descuento').addEventListener('click', () => abrirModalDescuento(null));
  document.getElementById('form-descuento').addEventListener('submit', guardarDescuento);

  // cierre genérico de modales
  document.querySelectorAll('[data-cerrar]').forEach((btn) => {
    btn.addEventListener('click', () => cerrarModal(btn.dataset.cerrar));
  });
  document.querySelectorAll('.modal-fondo').forEach((fondo) => {
    fondo.addEventListener('click', (e) => {
      if (e.target === fondo) cerrarModal(fondo.id);
    });
  });
});

async function cargarCategorias() {
  try {
    const data = await api.get('/api/categorias');
    categoriasCache = (data && data.categorias) || [];
    const opciones = categoriasCache.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('');
    document.getElementById('d-categoria').innerHTML = opciones;
  } catch (e) {
    // el modal de descuentos simplemente no va a poder abrirse bien; se
    // avisa recién ahí si el usuario intenta crear uno
  }
}

function cerrarModal(id) {
  document.getElementById(id).classList.add('oculto');
}

async function cargarTodo() {
  await cargarZonas();
  await Promise.all([cargarTurnos(), cargarExcepciones(), cargarDescuentos()]);
}

// =========================================================
// ZONAS
// =========================================================
async function cargarZonas() {
  const tbody = document.getElementById('tbody-zonas');
  tbody.innerHTML = '<tr><td colspan="5" class="cargando">Cargando…</td></tr>';
  try {
    const data = await api.get('/api/zonas');
    zonasCache = data.zonas || [];
    renderZonas();
    poblarSelectsDeZona();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5"><div class="mensaje error">Error: ${e.message}</div></td></tr>`;
  }
}

function renderZonas() {
  const tbody = document.getElementById('tbody-zonas');
  if (zonasCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="vacio">No hay zonas cargadas.</td></tr>';
    return;
  }
  tbody.innerHTML = zonasCache
    .map(
      (z) => `
    <tr>
      <td>${escapeHtml(z.nombre)}</td>
      <td class="num">${z.es_retiro ? '—' : fmtMoneda(z.precio_envio)}</td>
      <td>${z.es_retiro ? '<span class="badge">Sí</span>' : ''}</td>
      <td><span class="badge ${z.activa ? 'badge-pagado' : 'badge-no-pagado'}">${z.activa ? 'Activa' : 'Inactiva'}</span></td>
      <td class="acciones-col">
        <button class="chico" data-editar-zona="${z.id}">Editar</button>
        <button class="chico peligro" data-borrar-zona="${z.id}">Borrar</button>
      </td>
    </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-editar-zona]').forEach((btn) =>
    btn.addEventListener('click', () => abrirModalZona(Number(btn.dataset.editarZona)))
  );
  tbody.querySelectorAll('[data-borrar-zona]').forEach((btn) =>
    btn.addEventListener('click', () => borrarZona(Number(btn.dataset.borrarZona)))
  );
}

function poblarSelectsDeZona() {
  const opciones = zonasCache.map((z) => `<option value="${z.id}">${escapeHtml(z.nombre)}</option>`).join('');

  const filtro = document.getElementById('filtro-zona-turnos');
  const valorFiltro = filtro.value;
  filtro.innerHTML = '<option value="">Todas las zonas</option>' + opciones;
  filtro.value = valorFiltro;

  document.getElementById('t-zona').innerHTML = opciones;
}

function abrirModalZona(id) {
  const zona = id ? zonasCache.find((z) => z.id === id) : null;
  document.getElementById('modal-zona-titulo').textContent = zona ? 'Editar zona' : 'Nueva zona';
  document.getElementById('modal-zona-error').className = 'mensaje error oculto';
  document.getElementById('z-id').value = zona ? zona.id : '';
  document.getElementById('z-nombre').value = zona ? zona.nombre : '';
  document.getElementById('z-es-retiro').checked = zona ? !!zona.es_retiro : false;
  document.getElementById('z-precio-envio').value = zona ? zona.precio_envio : 0;
  document.getElementById('z-activa').checked = zona ? !!zona.activa : true;
  actualizarCampoPrecioEnvio();
  document.getElementById('modal-zona-fondo').classList.remove('oculto');
}

function actualizarCampoPrecioEnvio() {
  const esRetiro = document.getElementById('z-es-retiro').checked;
  const campo = document.getElementById('z-precio-envio-campo');
  campo.classList.toggle('oculto', esRetiro);
  if (esRetiro) document.getElementById('z-precio-envio').value = 0;
}

async function guardarZona(e) {
  e.preventDefault();
  const id = document.getElementById('z-id').value;
  const body = {
    nombre: document.getElementById('z-nombre').value.trim(),
    es_retiro: document.getElementById('z-es-retiro').checked,
    precio_envio: Number(document.getElementById('z-precio-envio').value) || 0,
    activa: document.getElementById('z-activa').checked,
  };
  const errorBox = document.getElementById('modal-zona-error');
  errorBox.className = 'mensaje error oculto';
  try {
    if (id) await api.put(`/api/zonas/${id}`, body);
    else await api.post('/api/zonas', body);
    cerrarModal('modal-zona-fondo');
    await cargarTodo();
  } catch (e2) {
    errorBox.textContent = e2.message;
    errorBox.className = 'mensaje error';
  }
}

async function borrarZona(id) {
  const zona = zonasCache.find((z) => z.id === id);
  if (!confirm(`¿Borrar la zona "${zona?.nombre}"? Si tiene turnos o pedidos asociados, se desactivará en vez de borrarse.`)) return;
  try {
    await api.del(`/api/zonas/${id}`);
    await cargarTodo();
  } catch (e) {
    alert(`No se pudo borrar: ${e.message}`);
  }
}

// =========================================================
// TURNOS RECURRENTES
// =========================================================
async function cargarTurnos() {
  const tbody = document.getElementById('tbody-turnos');
  tbody.innerHTML = '<tr><td colspan="6" class="cargando">Cargando…</td></tr>';
  try {
    const data = await api.get('/api/turnos');
    turnosCache = data.turnos || [];
    renderTurnos();
    poblarSelectTurnosParaExcepciones();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="mensaje error">Error: ${e.message}</div></td></tr>`;
  }
}

function renderTurnos() {
  const tbody = document.getElementById('tbody-turnos');
  const filtroZona = document.getElementById('filtro-zona-turnos').value;
  const lista = filtroZona ? turnosCache.filter((t) => String(t.zona_id) === filtroZona) : turnosCache;

  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="vacio">No hay turnos cargados.</td></tr>';
    return;
  }

  tbody.innerHTML = lista
    .map(
      (t) => `
    <tr>
      <td>${escapeHtml(t.zona_nombre)}</td>
      <td>${DIAS[t.dia_semana]}</td>
      <td>${t.hora_inicio}–${t.hora_fin}</td>
      <td>${t.capacidad_maxima ?? 'Sin límite'}</td>
      <td><span class="badge ${t.activo ? 'badge-pagado' : 'badge-no-pagado'}">${t.activo ? 'Activo' : 'Inactivo'}</span></td>
      <td class="acciones-col">
        <button class="chico" data-editar-turno="${t.id}">Editar</button>
        <button class="chico peligro" data-borrar-turno="${t.id}">Borrar</button>
      </td>
    </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-editar-turno]').forEach((btn) =>
    btn.addEventListener('click', () => abrirModalTurno(Number(btn.dataset.editarTurno)))
  );
  tbody.querySelectorAll('[data-borrar-turno]').forEach((btn) =>
    btn.addEventListener('click', () => borrarTurno(Number(btn.dataset.borrarTurno)))
  );
}

const ORDEN_DIAS = [1, 2, 3, 4, 5, 6, 0]; // lunes primero, domingo al final

function abrirModalTurno(id) {
  if (zonasCache.length === 0) {
    alert('Primero tenés que crear al menos una zona.');
    return;
  }
  const turno = id ? turnosCache.find((t) => t.id === id) : null;
  const esAlta = !turno;
  document.getElementById('modal-turno-titulo').textContent = turno ? 'Editar turno' : 'Nuevo turno';
  document.getElementById('modal-turno-error').className = 'mensaje error oculto';
  document.getElementById('t-id').value = turno ? turno.id : '';

  // Alta = multiselección de zonas y días. Edición = una zona y un día, como siempre.
  document.getElementById('t-grupo-multi').classList.toggle('oculto', !esAlta);
  document.getElementById('t-grupo-zona-simple').classList.toggle('oculto', esAlta);
  document.getElementById('t-grupo-dia-simple').classList.toggle('oculto', esAlta);
  document.getElementById('t-resumen').classList.add('oculto');
  document.getElementById('t-guardar').textContent = esAlta ? 'Crear turnos' : 'Guardar';

  if (esAlta) {
    // Sin nada tildado de entrada: crear turnos en zonas/días de más es peor que tener que tildar.
    document.getElementById('t-zonas-lista').innerHTML = zonasCache
      .map(
        (z) => `<label class="campo-check"><input type="checkbox" data-zona-id="${z.id}"> ${escapeHtml(z.nombre)}` +
          `${z.es_retiro ? ' <span class="nota-inline">(retiro)</span>' : ''}` +
          `${z.activa ? '' : ' <span class="nota-inline">(inactiva)</span>'}</label>`
      )
      .join('');
    document.getElementById('t-zona-todas').checked = false;
    document.getElementById('t-zona-todas').indeterminate = false;
    document.getElementById('t-dias-lista').innerHTML = ORDEN_DIAS.map(
      (d) => `<label class="campo-check"><input type="checkbox" data-dia="${d}"> ${DIAS[d]}</label>`
    ).join('');
  } else {
    document.getElementById('t-zona').value = turno.zona_id;
    document.getElementById('t-dia').value = turno.dia_semana;
  }
  document.getElementById('t-hora-inicio').value = turno ? turno.hora_inicio : '';
  document.getElementById('t-hora-fin').value = turno ? turno.hora_fin : '';
  document.getElementById('t-capacidad').value = turno && turno.capacidad_maxima !== null ? turno.capacidad_maxima : '';
  document.getElementById('t-activo').checked = turno ? !!turno.activo : true;
  document.getElementById('modal-turno-fondo').classList.remove('oculto');
}

function zonasTildadasTurno() {
  return [...document.querySelectorAll('#t-zonas-lista input:checked')].map((cb) => Number(cb.dataset.zonaId));
}
function diasTildadosTurno() {
  return [...document.querySelectorAll('#t-dias-lista input:checked')].map((cb) => Number(cb.dataset.dia));
}

function sincronizarTodasLasZonasTurno() {
  const checks = [...document.querySelectorAll('#t-zonas-lista input[type=checkbox]')];
  const marcadas = checks.filter((cb) => cb.checked).length;
  const todas = document.getElementById('t-zona-todas');
  todas.checked = checks.length > 0 && marcadas === checks.length;
  todas.indeterminate = marcadas > 0 && marcadas < checks.length;
}

function marcarDiasTurno(dias) {
  document.querySelectorAll('#t-dias-lista input[type=checkbox]').forEach((cb) => {
    cb.checked = dias.includes(Number(cb.dataset.dia));
  });
  actualizarResumenAltaTurnos();
}

// Resumen en vivo del alta: cuántos turnos se van a crear, cuántos ya existen (se omiten) y
// cuántos se superponen con otro turno de la misma zona y día. Se calcula con turnosCache; el
// servidor igual vuelve a omitir duplicados, así que esto es informativo.
function actualizarResumenAltaTurnos() {
  const box = document.getElementById('t-resumen');
  if (document.getElementById('t-id').value) return;
  const zonas = zonasTildadasTurno();
  const dias = diasTildadosTurno();
  const inicio = document.getElementById('t-hora-inicio').value;
  const fin = document.getElementById('t-hora-fin').value;
  if (!zonas.length || !dias.length) {
    box.classList.add('oculto');
    return;
  }

  const combinaciones = zonas.length * dias.length;
  let duplicados = 0;
  let superpuestos = 0;
  if (inicio && fin && fin > inicio) {
    zonas.forEach((z) =>
      dias.forEach((d) => {
        const mismos = turnosCache.filter((t) => t.zona_id === z && t.dia_semana === d);
        if (mismos.some((t) => t.hora_inicio === inicio && t.hora_fin === fin)) duplicados++;
        else if (mismos.some((t) => inicio < t.hora_fin && t.hora_inicio < fin)) superpuestos++;
      })
    );
  }
  const crear = combinaciones - duplicados;
  let texto = `Se van a crear ${crear} ${crear === 1 ? 'turno' : 'turnos'} (${zonas.length} ${zonas.length === 1 ? 'zona' : 'zonas'} × ${dias.length} ${dias.length === 1 ? 'día' : 'días'}).`;
  if (duplicados) texto += ` ${duplicados} ya ${duplicados === 1 ? 'existe' : 'existen'} igual y se ${duplicados === 1 ? 'omite' : 'omiten'}.`;
  if (superpuestos) texto += ` ⚠ ${superpuestos} se ${superpuestos === 1 ? 'superpone' : 'superponen'} con otro turno de la misma zona y día.`;
  box.textContent = texto;
  box.classList.remove('oculto');
}

async function guardarTurno(e) {
  e.preventDefault();
  const id = document.getElementById('t-id').value;
  const capacidadRaw = document.getElementById('t-capacidad').value;
  const errorBox = document.getElementById('modal-turno-error');
  errorBox.className = 'mensaje error oculto';
  const mostrarError = (msg) => {
    errorBox.textContent = msg;
    errorBox.className = 'mensaje error';
  };

  // --- edición de un turno existente (igual que antes) ---
  if (id) {
    const body = {
      zona_id: Number(document.getElementById('t-zona').value),
      dia_semana: Number(document.getElementById('t-dia').value),
      hora_inicio: document.getElementById('t-hora-inicio').value,
      hora_fin: document.getElementById('t-hora-fin').value,
      capacidad_maxima: capacidadRaw === '' ? '' : Number(capacidadRaw),
      activo: document.getElementById('t-activo').checked,
    };
    try {
      await api.put(`/api/turnos/${id}`, body);
      cerrarModal('modal-turno-fondo');
      await cargarTurnos();
    } catch (e2) {
      mostrarError(e2.message);
    }
    return;
  }

  // --- alta masiva: zonas × días ---
  const zonas = zonasTildadasTurno();
  const dias = diasTildadosTurno();
  const inicio = document.getElementById('t-hora-inicio').value;
  const fin = document.getElementById('t-hora-fin').value;
  if (!zonas.length) return mostrarError('Elegí al menos una zona.');
  if (!dias.length) return mostrarError('Elegí al menos un día de la semana.');
  if (fin <= inicio) return mostrarError('La hora de fin tiene que ser posterior a la de inicio.');

  const boton = document.getElementById('t-guardar');
  boton.disabled = true;
  try {
    const r = await api.post('/api/turnos/lote', {
      zona_ids: zonas,
      dias_semana: dias,
      hora_inicio: inicio,
      hora_fin: fin,
      capacidad_maxima: capacidadRaw === '' ? '' : Number(capacidadRaw),
      activo: document.getElementById('t-activo').checked,
    });
    if (r.creados === 0) {
      mostrarError('Todos esos turnos ya existían, no se creó ninguno.');
      return;
    }
    cerrarModal('modal-turno-fondo');
    await cargarTurnos();
    avisoGlobal(
      `Se ${r.creados === 1 ? 'creó 1 turno' : `crearon ${r.creados} turnos`}` +
        (r.omitidos ? ` (${r.omitidos} ya ${r.omitidos === 1 ? 'existía' : 'existían'} y se ${r.omitidos === 1 ? 'omitió' : 'omitieron'})` : '') + '.'
    );
  } catch (e2) {
    mostrarError(e2.message);
  } finally {
    boton.disabled = false;
  }
}

async function borrarTurno(id) {
  if (!confirm('¿Borrar este turno? Si tiene pedidos o excepciones asociadas, se desactivará en vez de borrarse.')) return;
  try {
    await api.del(`/api/turnos/${id}`);
    await cargarTurnos();
    await cargarExcepciones();
  } catch (e) {
    alert(`No se pudo borrar: ${e.message}`);
  }
}

// =========================================================
// EXCEPCIONES
// =========================================================
async function cargarExcepciones() {
  const tbody = document.getElementById('tbody-excepciones');
  tbody.innerHTML = '<tr><td colspan="7" class="cargando">Cargando…</td></tr>';
  try {
    const data = await api.get('/api/turnos-excepciones');
    excepcionesCache = data.excepciones || [];
    renderExcepciones();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="mensaje error">Error: ${e.message}</div></td></tr>`;
  }
}

const TIPO_LABEL = {
  cancelado: 'Cancelado',
  capacidad_modificada: 'Capacidad modificada',
  horario_modificado: 'Horario modificado',
};

function detalleExcepcion(ex) {
  if (ex.tipo === 'capacidad_modificada') return `Capacidad: ${ex.capacidad_maxima}`;
  if (ex.tipo === 'horario_modificado') return `${ex.hora_inicio}–${ex.hora_fin}`;
  return '—';
}

function filaExcepcion(ex, { hijaDeLote = null } = {}) {
  const atributos = hijaDeLote
    ? ` class="oculto" data-lote-hijo="${escapeHtml(hijaDeLote)}" style="background:var(--paper)"`
    : '';
  return `
      <tr${atributos}>
        <td>${hijaDeLote ? '<span class="nota-inline">↳</span> ' : ''}${escapeHtml(ex.zona_nombre)}</td>
        <td>${DIAS[ex.dia_semana]} ${ex.turno_hora_inicio}–${ex.turno_hora_fin}</td>
        <td>${fmtFecha(ex.fecha)}</td>
        <td>${TIPO_LABEL[ex.tipo] || ex.tipo}</td>
        <td>${detalleExcepcion(ex)}</td>
        <td>${escapeHtml(ex.motivo || '—')}</td>
        <td class="acciones-col">
          <button class="chico peligro" data-borrar-excepcion="${ex.id}">Borrar</button>
        </td>
      </tr>`;
}

// Las excepciones creadas con "Cancelar entregas" comparten lote_id: se muestran como UNA fila
// (con detalle desplegable) y se revierten juntas. Las cargadas de a una (lote_id NULL) se
// muestran como siempre.
function filaLote(loteId, items) {
  const fechas = items.map((e) => e.fecha).sort();
  const dias = new Set(fechas).size;
  const zonasDelLote = [...new Set(items.map((e) => e.zona_nombre))];
  const zonasActivas = zonasCache.filter((z) => z.activa);
  const cubreTodas = zonasActivas.length > 1 && zonasActivas.every((z) => zonasDelLote.includes(z.nombre));
  const etiquetaZonas = cubreTodas ? 'Todas las zonas' : zonasDelLote.join(', ');
  const etiquetaFecha = dias === 1
    ? fmtFecha(fechas[0])
    : `${fmtFecha(fechas[0])} – ${fmtFecha(fechas[fechas.length - 1])} (${dias} días)`;
  const motivo = items.find((e) => e.motivo)?.motivo;
  const hijas = items
    .slice()
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.zona_nombre.localeCompare(b.zona_nombre))
    .map((e) => filaExcepcion(e, { hijaDeLote: loteId }))
    .join('');
  return `
      <tr>
        <td>${escapeHtml(etiquetaZonas)}</td>
        <td>${items.length} ${items.length === 1 ? 'turno' : 'turnos'}</td>
        <td>${etiquetaFecha}</td>
        <td>${TIPO_LABEL.cancelado}</td>
        <td>—</td>
        <td>${escapeHtml(motivo || '—')}</td>
        <td class="acciones-col">
          <button class="chico" data-toggle-lote="${escapeHtml(loteId)}">Ver</button>
          <button class="chico peligro" data-revertir-lote="${escapeHtml(loteId)}" data-cantidad="${items.length}">Revertir</button>
        </td>
      </tr>${hijas}`;
}

function renderExcepciones() {
  const tbody = document.getElementById('tbody-excepciones');
  if (excepcionesCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="vacio">No hay excepciones cargadas.</td></tr>';
    return;
  }

  // Agrupa respetando el orden de la lista (fecha descendente): cada lote aparece donde
  // aparece su primera excepción.
  const lotes = new Map();
  excepcionesCache.forEach((ex) => {
    if (ex.lote_id) {
      if (!lotes.has(ex.lote_id)) lotes.set(ex.lote_id, []);
      lotes.get(ex.lote_id).push(ex);
    }
  });
  const yaMostrados = new Set();
  const filas = [];
  excepcionesCache.forEach((ex) => {
    if (!ex.lote_id) {
      filas.push(filaExcepcion(ex));
    } else if (!yaMostrados.has(ex.lote_id)) {
      yaMostrados.add(ex.lote_id);
      filas.push(filaLote(ex.lote_id, lotes.get(ex.lote_id)));
    }
  });
  tbody.innerHTML = filas.join('');

  tbody.querySelectorAll('[data-borrar-excepcion]').forEach((btn) =>
    btn.addEventListener('click', () => borrarExcepcion(Number(btn.dataset.borrarExcepcion)))
  );
  tbody.querySelectorAll('[data-toggle-lote]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const filasHijas = tbody.querySelectorAll(`[data-lote-hijo="${CSS.escape(btn.dataset.toggleLote)}"]`);
      const mostrar = filasHijas.length && filasHijas[0].classList.contains('oculto');
      filasHijas.forEach((tr) => tr.classList.toggle('oculto', !mostrar));
      btn.textContent = mostrar ? 'Ocultar' : 'Ver';
    })
  );
  tbody.querySelectorAll('[data-revertir-lote]').forEach((btn) =>
    btn.addEventListener('click', () => revertirLote(btn.dataset.revertirLote, Number(btn.dataset.cantidad)))
  );
}

function poblarSelectTurnosParaExcepciones() {
  const select = document.getElementById('e-turno');
  select.innerHTML = turnosCache
    .map(
      (t) => `<option value="${t.id}">${escapeHtml(t.zona_nombre)} — ${DIAS[t.dia_semana]} ${t.hora_inicio}–${t.hora_fin}</option>`
    )
    .join('');
}

function abrirModalExcepcion() {
  if (turnosCache.length === 0) {
    alert('Primero tenés que crear al menos un turno recurrente.');
    return;
  }
  document.getElementById('modal-excepcion-error').className = 'mensaje error oculto';
  document.getElementById('form-excepcion').reset();
  document.getElementById('e-tipo').value = 'cancelado';
  actualizarCamposExcepcion();
  document.getElementById('modal-excepcion-fondo').classList.remove('oculto');
}

function actualizarCamposExcepcion() {
  const tipo = document.getElementById('e-tipo').value;
  document.getElementById('e-campo-capacidad').classList.toggle('oculto', tipo !== 'capacidad_modificada');
  document.getElementById('e-campo-horario').classList.toggle('oculto', tipo !== 'horario_modificado');
}

async function guardarExcepcion(e) {
  e.preventDefault();
  const tipo = document.getElementById('e-tipo').value;
  const body = {
    turno_entrega_id: Number(document.getElementById('e-turno').value),
    fecha: document.getElementById('e-fecha').value,
    tipo,
    motivo: document.getElementById('e-motivo').value.trim() || null,
  };
  if (tipo === 'capacidad_modificada') {
    body.capacidad_maxima = Number(document.getElementById('e-capacidad').value);
  }
  if (tipo === 'horario_modificado') {
    body.hora_inicio = document.getElementById('e-hora-inicio').value;
    body.hora_fin = document.getElementById('e-hora-fin').value;
  }

  const errorBox = document.getElementById('modal-excepcion-error');
  errorBox.className = 'mensaje error oculto';
  try {
    await api.post('/api/turnos-excepciones', body);
    cerrarModal('modal-excepcion-fondo');
    await cargarExcepciones();
  } catch (e2) {
    errorBox.textContent = e2.message;
    errorBox.className = 'mensaje error';
  }
}

async function borrarExcepcion(id) {
  if (!confirm('¿Borrar esta excepción?')) return;
  try {
    await api.del(`/api/turnos-excepciones/${id}`);
    await cargarExcepciones();
  } catch (e) {
    alert(`No se pudo borrar: ${e.message}`);
  }
}

// =========================================================
// CANCELACIÓN MASIVA DE ENTREGAS
// =========================================================
let cancelacionPendiente = null; // body validado entre "Revisar" y "Confirmar"

function abrirModalCancelacion() {
  const activas = zonasCache.filter((z) => z.activa);
  if (activas.length === 0) {
    alert('No hay zonas activas.');
    return;
  }
  document.getElementById('form-cancelacion').reset();
  document.getElementById('modal-cancelacion-error').className = 'mensaje error oculto';
  document.getElementById('modal-cancelacion-error-2').className = 'mensaje error oculto';
  document.getElementById('c-zonas-lista').innerHTML = activas
    .map(
      (z) => `<label class="campo-check"><input type="checkbox" data-zona-id="${z.id}" checked> ${escapeHtml(z.nombre)}${z.es_retiro ? ' <span class="nota-inline">(retiro)</span>' : ''}</label>`
    )
    .join('');
  document.getElementById('c-zona-todas').checked = true;
  document.getElementById('c-zona-todas').indeterminate = false;
  mostrarPasoCancelacion(1);
  document.getElementById('modal-cancelacion-fondo').classList.remove('oculto');
}

function mostrarPasoCancelacion(paso) {
  document.getElementById('form-cancelacion').classList.toggle('oculto', paso !== 1);
  document.getElementById('c-paso-resumen').classList.toggle('oculto', paso !== 2);
}

function sincronizarTodasLasZonas() {
  const checks = [...document.querySelectorAll('#c-zonas-lista input[type=checkbox]')];
  const marcadas = checks.filter((cb) => cb.checked).length;
  const todas = document.getElementById('c-zona-todas');
  todas.checked = marcadas === checks.length;
  todas.indeterminate = marcadas > 0 && marcadas < checks.length;
}

function volverACancelacion() {
  mostrarPasoCancelacion(1);
}

// Paso 1 -> 2: pide al servidor una simulación (dry_run) y muestra qué se va a cancelar y
// cuántos pedidos ya hechos hay en esos turnos, antes de tocar nada.
async function revisarCancelacion(e) {
  e.preventDefault();
  const errorBox = document.getElementById('modal-cancelacion-error');
  errorBox.className = 'mensaje error oculto';

  const checks = [...document.querySelectorAll('#c-zonas-lista input[type=checkbox]')];
  const elegidas = checks.filter((cb) => cb.checked).map((cb) => Number(cb.dataset.zonaId));
  if (elegidas.length === 0) {
    errorBox.textContent = 'Elegí al menos una zona.';
    errorBox.className = 'mensaje error';
    return;
  }
  const desde = document.getElementById('c-desde').value;
  const hasta = document.getElementById('c-hasta').value;
  if (hasta && hasta < desde) {
    errorBox.textContent = 'La fecha "hasta" no puede ser anterior a "desde".';
    errorBox.className = 'mensaje error';
    return;
  }

  cancelacionPendiente = {
    fecha_desde: desde,
    fecha_hasta: hasta || null,
    zona_ids: elegidas.length === checks.length ? null : elegidas, // null = todas
    motivo: document.getElementById('c-motivo').value.trim() || null,
  };

  const boton = e.submitter;
  if (boton) boton.disabled = true;
  try {
    const r = await api.post('/api/turnos-excepciones/lote', { ...cancelacionPendiente, dry_run: true });
    renderResumenCancelacion(r);
    document.getElementById('modal-cancelacion-error-2').className = 'mensaje error oculto';
    mostrarPasoCancelacion(2);
  } catch (e2) {
    errorBox.textContent = e2.message;
    errorBox.className = 'mensaje error';
  } finally {
    if (boton) boton.disabled = false;
  }
}

function renderResumenCancelacion(r) {
  const { fecha_desde: desde, fecha_hasta: hasta } = cancelacionPendiente;
  const cuando = hasta && hasta !== desde ? `${fmtFecha(desde)} al ${fmtFecha(hasta)}` : fmtFecha(desde);
  const partes = [];

  if (r.turnos_a_cancelar === 0) {
    partes.push(`<div class="mensaje">Todos esos turnos ya estaban cancelados (${cuando}). No hay nada para hacer.</div>`);
  } else {
    partes.push(
      `<div class="mensaje"><strong>Se van a cancelar ${r.turnos_a_cancelar} ${r.turnos_a_cancelar === 1 ? 'turno' : 'turnos'}</strong>` +
      ` — ${escapeHtml(r.zonas.join(', '))} — ${cuando}.</div>`
    );
  }
  if (r.ya_canceladas > 0 && r.turnos_a_cancelar > 0) {
    partes.push(`<p class="campo-ayuda">${r.ya_canceladas} ya estaban cancelados y no se tocan.</p>`);
  }
  if (r.reemplazadas > 0) {
    partes.push(`<p class="campo-ayuda">${r.reemplazadas} excepción(es) de capacidad u horario de esos turnos se reemplazan por la cancelación.</p>`);
  }

  if (r.pedidos_afectados > 0) {
    const items = r.pedidos
      .map(
        (p) => `<li>#${p.id} — ${fmtFecha(p.fecha)} · ${escapeHtml(p.zona || '—')} ${escapeHtml(p.horario || '')} · ${escapeHtml(p.estado)} · ${p.pagado ? 'pagado' : 'sin pagar'}</li>`
      )
      .join('');
    const resto = r.pedidos_afectados > r.pedidos.length ? `<li>…y ${r.pedidos_afectados - r.pedidos.length} más</li>` : '';
    partes.push(
      `<div class="mensaje error">Ya hay <strong>${r.pedidos_afectados}</strong> ${r.pedidos_afectados === 1 ? 'pedido hecho' : 'pedidos hechos'} para esos turnos` +
      ` (${r.pedidos_pagados} ${r.pedidos_pagados === 1 ? 'pagado' : 'pagados'}). Siguen como están: la cancelación solo bloquea pedidos nuevos. Conviene avisarles.` +
      `<details style="margin-top:8px"><summary>Ver pedidos</summary><ul style="margin:8px 0 0 18px;padding:0">${items}${resto}</ul></details></div>`
    );
  } else {
    partes.push('<p class="campo-ayuda">No hay pedidos hechos en esos turnos.</p>');
  }

  document.getElementById('c-resumen').innerHTML = partes.join('');
  document.getElementById('c-confirmar').disabled = r.turnos_a_cancelar === 0;
}

async function confirmarCancelacion() {
  if (!cancelacionPendiente) return;
  const errorBox = document.getElementById('modal-cancelacion-error-2');
  errorBox.className = 'mensaje error oculto';
  const boton = document.getElementById('c-confirmar');
  boton.disabled = true;
  try {
    const r = await api.post('/api/turnos-excepciones/lote', { ...cancelacionPendiente, dry_run: false });
    cancelacionPendiente = null;
    cerrarModal('modal-cancelacion-fondo');
    await cargarExcepciones();
    avisoGlobal(`Se cancelaron ${r.turnos_a_cancelar} ${r.turnos_a_cancelar === 1 ? 'turno' : 'turnos'}. Podés revertirlo desde la fila de la lista.`);
  } catch (e) {
    errorBox.textContent = e.message;
    errorBox.className = 'mensaje error';
    boton.disabled = false;
  }
}

async function revertirLote(loteId, cantidad) {
  if (!confirm(`¿Revertir esta cancelación? Se vuelven a ofrecer ${cantidad} ${cantidad === 1 ? 'turno' : 'turnos'} para pedidos nuevos.`)) return;
  try {
    const r = await api.del(`/api/turnos-excepciones/lote?lote_id=${encodeURIComponent(loteId)}`);
    await cargarExcepciones();
    avisoGlobal(`Se revirtió la cancelación (${r.eliminadas} ${r.eliminadas === 1 ? 'turno' : 'turnos'} habilitados de nuevo).`);
  } catch (e) {
    alert(`No se pudo revertir: ${e.message}`);
  }
}

let avisoTimer = null;
function avisoGlobal(texto) {
  const box = document.getElementById('estado-global');
  if (!box) return;
  box.textContent = texto;
  box.className = 'mensaje ok';
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => (box.className = 'mensaje oculto'), 8000);
}

// =========================================================
// DESCUENTOS DE ENVÍO
// =========================================================
async function cargarDescuentos() {
  const tbody = document.getElementById('tbody-descuentos');
  tbody.innerHTML = '<tr><td colspan="6" class="cargando">Cargando…</td></tr>';
  try {
    const data = await api.get('/api/descuentos-envio');
    descuentosCache = (data && data.descuentos) || [];
    renderDescuentos();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="mensaje error">Error: ${e.message}</div></td></tr>`;
  }
}

function renderDescuentos() {
  const tbody = document.getElementById('tbody-descuentos');
  if (descuentosCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="vacio">No hay descuentos de envío cargados.</td></tr>';
    return;
  }
  tbody.innerHTML = descuentosCache
    .map(
      (d) => `
    <tr>
      <td>${escapeHtml(d.categoria_nombre)}</td>
      <td class="num">${d.carillas_desde}</td>
      <td class="num">${d.carillas_hasta ?? 'Sin techo'}</td>
      <td class="num">${d.porcentaje_descuento}%</td>
      <td><span class="badge ${d.activa ? 'badge-pagado' : 'badge-no-pagado'}">${d.activa ? 'Activo' : 'Inactivo'}</span></td>
      <td class="acciones-col">
        <button class="chico" data-editar-descuento="${d.id}">Editar</button>
        <button class="chico peligro" data-borrar-descuento="${d.id}">Borrar</button>
      </td>
    </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-editar-descuento]').forEach((btn) =>
    btn.addEventListener('click', () => abrirModalDescuento(Number(btn.dataset.editarDescuento)))
  );
  tbody.querySelectorAll('[data-borrar-descuento]').forEach((btn) =>
    btn.addEventListener('click', () => borrarDescuento(Number(btn.dataset.borrarDescuento)))
  );
}

function abrirModalDescuento(id) {
  if (categoriasCache.length === 0) {
    alert('Primero tenés que crear al menos una categoría (sección Catálogo).');
    return;
  }
  const descuento = id ? descuentosCache.find((d) => d.id === id) : null;
  document.getElementById('modal-descuento-titulo').textContent = descuento ? 'Editar descuento' : 'Nuevo descuento';
  document.getElementById('modal-descuento-error').className = 'mensaje error oculto';
  document.getElementById('d-id').value = descuento ? descuento.id : '';
  document.getElementById('d-categoria').value = descuento ? descuento.categoria_id : categoriasCache[0].id;
  document.getElementById('d-desde').value = descuento ? descuento.carillas_desde : '0';
  document.getElementById('d-hasta').value = descuento && descuento.carillas_hasta !== null ? descuento.carillas_hasta : '';
  document.getElementById('d-porcentaje').value = descuento ? descuento.porcentaje_descuento : '0';
  document.getElementById('d-activa').checked = descuento ? !!descuento.activa : true;
  document.getElementById('modal-descuento-fondo').classList.remove('oculto');
}

async function guardarDescuento(e) {
  e.preventDefault();
  const id = document.getElementById('d-id').value;
  const hastaRaw = document.getElementById('d-hasta').value;
  const body = {
    categoria_id: Number(document.getElementById('d-categoria').value),
    carillas_desde: Number(document.getElementById('d-desde').value),
    carillas_hasta: hastaRaw === '' ? '' : Number(hastaRaw),
    porcentaje_descuento: Number(document.getElementById('d-porcentaje').value),
    activa: document.getElementById('d-activa').checked,
  };
  const errorBox = document.getElementById('modal-descuento-error');
  errorBox.className = 'mensaje error oculto';
  try {
    if (id) await api.put(`/api/descuentos-envio/${id}`, body);
    else await api.post('/api/descuentos-envio', body);
    cerrarModal('modal-descuento-fondo');
    await cargarDescuentos();
  } catch (e2) {
    errorBox.textContent = e2.message;
    errorBox.className = 'mensaje error';
  }
}

async function borrarDescuento(id) {
  if (!confirm('¿Borrar este descuento de envío?')) return;
  try {
    await api.del(`/api/descuentos-envio/${id}`);
    await cargarDescuentos();
  } catch (e) {
    alert(`No se pudo borrar: ${e.message}`);
  }
}
