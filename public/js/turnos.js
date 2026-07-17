let zonasCache = [];
let turnosCache = [];
let excepcionesCache = [];

document.addEventListener('DOMContentLoaded', () => {
  cargarTodo();

  // --- zonas ---
  document.getElementById('btn-nueva-zona').addEventListener('click', () => abrirModalZona(null));
  document.getElementById('form-zona').addEventListener('submit', guardarZona);

  // --- turnos ---
  document.getElementById('btn-nuevo-turno').addEventListener('click', () => abrirModalTurno(null));
  document.getElementById('form-turno').addEventListener('submit', guardarTurno);
  document.getElementById('filtro-zona-turnos').addEventListener('change', renderTurnos);

  // --- excepciones ---
  document.getElementById('btn-nueva-excepcion').addEventListener('click', abrirModalExcepcion);
  document.getElementById('form-excepcion').addEventListener('submit', guardarExcepcion);
  document.getElementById('e-tipo').addEventListener('change', actualizarCamposExcepcion);

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

function cerrarModal(id) {
  document.getElementById(id).classList.add('oculto');
}

async function cargarTodo() {
  await cargarZonas();
  await Promise.all([cargarTurnos(), cargarExcepciones()]);
}

// =========================================================
// ZONAS
// =========================================================
async function cargarZonas() {
  const tbody = document.getElementById('tbody-zonas');
  tbody.innerHTML = '<tr><td colspan="3" class="cargando">Cargando…</td></tr>';
  try {
    const data = await api.get('/api/zonas');
    zonasCache = data.zonas || [];
    renderZonas();
    poblarSelectsDeZona();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="3"><div class="mensaje error">Error: ${e.message}</div></td></tr>`;
  }
}

function renderZonas() {
  const tbody = document.getElementById('tbody-zonas');
  if (zonasCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="vacio">No hay zonas cargadas.</td></tr>';
    return;
  }
  tbody.innerHTML = zonasCache
    .map(
      (z) => `
    <tr>
      <td>${escapeHtml(z.nombre)}</td>
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
  document.getElementById('z-activa').checked = zona ? !!zona.activa : true;
  document.getElementById('modal-zona-fondo').classList.remove('oculto');
}

async function guardarZona(e) {
  e.preventDefault();
  const id = document.getElementById('z-id').value;
  const body = {
    nombre: document.getElementById('z-nombre').value.trim(),
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

function abrirModalTurno(id) {
  if (zonasCache.length === 0) {
    alert('Primero tenés que crear al menos una zona.');
    return;
  }
  const turno = id ? turnosCache.find((t) => t.id === id) : null;
  document.getElementById('modal-turno-titulo').textContent = turno ? 'Editar turno' : 'Nuevo turno';
  document.getElementById('modal-turno-error').className = 'mensaje error oculto';
  document.getElementById('t-id').value = turno ? turno.id : '';
  document.getElementById('t-zona').value = turno ? turno.zona_id : zonasCache[0].id;
  document.getElementById('t-dia').value = turno ? turno.dia_semana : '1';
  document.getElementById('t-hora-inicio').value = turno ? turno.hora_inicio : '';
  document.getElementById('t-hora-fin').value = turno ? turno.hora_fin : '';
  document.getElementById('t-capacidad').value = turno && turno.capacidad_maxima !== null ? turno.capacidad_maxima : '';
  document.getElementById('t-activo').checked = turno ? !!turno.activo : true;
  document.getElementById('modal-turno-fondo').classList.remove('oculto');
}

async function guardarTurno(e) {
  e.preventDefault();
  const id = document.getElementById('t-id').value;
  const capacidadRaw = document.getElementById('t-capacidad').value;
  const body = {
    zona_id: Number(document.getElementById('t-zona').value),
    dia_semana: Number(document.getElementById('t-dia').value),
    hora_inicio: document.getElementById('t-hora-inicio').value,
    hora_fin: document.getElementById('t-hora-fin').value,
    capacidad_maxima: capacidadRaw === '' ? '' : Number(capacidadRaw),
    activo: document.getElementById('t-activo').checked,
  };
  const errorBox = document.getElementById('modal-turno-error');
  errorBox.className = 'mensaje error oculto';
  try {
    if (id) await api.put(`/api/turnos/${id}`, body);
    else await api.post('/api/turnos', body);
    cerrarModal('modal-turno-fondo');
    await cargarTurnos();
  } catch (e2) {
    errorBox.textContent = e2.message;
    errorBox.className = 'mensaje error';
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

function renderExcepciones() {
  const tbody = document.getElementById('tbody-excepciones');
  if (excepcionesCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="vacio">No hay excepciones cargadas.</td></tr>';
    return;
  }
  tbody.innerHTML = excepcionesCache
    .map((ex) => {
      let detalle = '—';
      if (ex.tipo === 'capacidad_modificada') detalle = `Capacidad: ${ex.capacidad_maxima}`;
      if (ex.tipo === 'horario_modificado') detalle = `${ex.hora_inicio}–${ex.hora_fin}`;
      return `
      <tr>
        <td>${escapeHtml(ex.zona_nombre)}</td>
        <td>${DIAS[ex.dia_semana]} ${ex.turno_hora_inicio}–${ex.turno_hora_fin}</td>
        <td>${fmtFecha(ex.fecha)}</td>
        <td>${TIPO_LABEL[ex.tipo] || ex.tipo}</td>
        <td>${detalle}</td>
        <td>${escapeHtml(ex.motivo || '—')}</td>
        <td class="acciones-col">
          <button class="chico peligro" data-borrar-excepcion="${ex.id}">Borrar</button>
        </td>
      </tr>`;
    })
    .join('');

  tbody.querySelectorAll('[data-borrar-excepcion]').forEach((btn) =>
    btn.addEventListener('click', () => borrarExcepcion(Number(btn.dataset.borrarExcepcion)))
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
