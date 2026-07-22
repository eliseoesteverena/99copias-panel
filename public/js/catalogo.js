let categoriasCache = [];
let productosCache = [];
let reglasCache = [];

document.addEventListener('DOMContentLoaded', () => {
  cargarTodo();

  // --- categorías ---
  document.getElementById('btn-nueva-categoria').addEventListener('click', () => abrirModalCategoria(null));
  document.getElementById('form-categoria').addEventListener('submit', guardarCategoria);

  // --- productos ---
  document.getElementById('btn-nuevo-producto').addEventListener('click', () => abrirModalProducto(null));
  document.getElementById('form-producto').addEventListener('submit', guardarProducto);
  document.getElementById('filtro-categoria-productos').addEventListener('change', renderProductos);
  document.getElementById('p-jerarquia').addEventListener('change', actualizarHintCategoriaProducto);

  // --- reglas de producción ---
  document.getElementById('btn-nueva-regla').addEventListener('click', () => abrirModalRegla(null));
  document.getElementById('form-regla').addEventListener('submit', guardarRegla);

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
  await cargarCategorias();
  await Promise.all([cargarProductos(), cargarReglas()]);
}

// =========================================================
// CATEGORÍAS
// =========================================================
async function cargarCategorias() {
  const tbody = document.getElementById('tbody-categorias');
  tbody.innerHTML = '<tr><td colspan="4" class="cargando">Cargando…</td></tr>';
  try {
    const data = await api.get('/api/categorias');
    categoriasCache = (data && data.categorias) || [];
    renderCategorias();
    poblarSelectsDeCategoria();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="mensaje error">Error: ${e.message}</div></td></tr>`;
  }
}

function renderCategorias() {
  const tbody = document.getElementById('tbody-categorias');
  if (categoriasCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" class="vacio">No hay categorías cargadas.</td></tr>';
    return;
  }
  tbody.innerHTML = categoriasCache
    .map(
      (c) => `
    <tr>
      <td class="mono">${escapeHtml(c.codigo)}</td>
      <td>${escapeHtml(c.nombre)}</td>
      <td><span class="badge ${c.activa ? 'badge-pagado' : 'badge-no-pagado'}">${c.activa ? 'Activa' : 'Inactiva'}</span></td>
      <td class="acciones-col">
        <button class="chico" data-editar-categoria="${c.id}">Editar</button>
        <button class="chico peligro" data-borrar-categoria="${c.id}">Borrar</button>
      </td>
    </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-editar-categoria]').forEach((btn) =>
    btn.addEventListener('click', () => abrirModalCategoria(Number(btn.dataset.editarCategoria)))
  );
  tbody.querySelectorAll('[data-borrar-categoria]').forEach((btn) =>
    btn.addEventListener('click', () => borrarCategoria(Number(btn.dataset.borrarCategoria)))
  );
}

function poblarSelectsDeCategoria() {
  const opciones = categoriasCache
    .map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)} (${escapeHtml(c.codigo)})</option>`)
    .join('');

  // filtro de productos: mantiene "todas"
  const filtro = document.getElementById('filtro-categoria-productos');
  const valorFiltro = filtro.value;
  filtro.innerHTML = '<option value="">Todas las categorías</option>' + opciones;
  filtro.value = valorFiltro;

  // select del modal de producto: mantiene "transversal"
  const selProducto = document.getElementById('p-categoria');
  const valorProducto = selProducto.value;
  selProducto.innerHTML = '<option value="">— Transversal —</option>' + opciones;
  selProducto.value = valorProducto;

  // select del modal de regla: sin opción vacía, siempre requiere una
  document.getElementById('r-categoria').innerHTML = opciones;
}

function abrirModalCategoria(id) {
  const categoria = id ? categoriasCache.find((c) => c.id === id) : null;
  document.getElementById('modal-categoria-titulo').textContent = categoria ? 'Editar categoría' : 'Nueva categoría';
  document.getElementById('modal-categoria-error').className = 'mensaje error oculto';
  document.getElementById('cat-id').value = categoria ? categoria.id : '';
  document.getElementById('cat-codigo').value = categoria ? categoria.codigo : '';
  document.getElementById('cat-codigo').disabled = !!categoria; // código inmutable al editar
  document.getElementById('cat-nombre').value = categoria ? categoria.nombre : '';
  document.getElementById('cat-activa').checked = categoria ? !!categoria.activa : true;
  document.getElementById('modal-categoria-fondo').classList.remove('oculto');
}

async function guardarCategoria(e) {
  e.preventDefault();
  const id = document.getElementById('cat-id').value;
  const body = {
    nombre: document.getElementById('cat-nombre').value.trim(),
    activa: document.getElementById('cat-activa').checked,
  };
  if (!id) body.codigo = document.getElementById('cat-codigo').value.trim();

  const errorBox = document.getElementById('modal-categoria-error');
  errorBox.className = 'mensaje error oculto';
  try {
    if (id) await api.put(`/api/categorias/${id}`, body);
    else await api.post('/api/categorias', body);
    cerrarModal('modal-categoria-fondo');
    await cargarTodo();
  } catch (e2) {
    errorBox.textContent = e2.message;
    errorBox.className = 'mensaje error';
  }
}

async function borrarCategoria(id) {
  const categoria = categoriasCache.find((c) => c.id === id);
  if (!confirm(`¿Borrar la categoría "${categoria?.nombre}"? Si tiene productos, reglas o pedidos asociados, se desactivará en vez de borrarse.`)) return;
  try {
    await api.del(`/api/categorias/${id}`);
    await cargarTodo();
  } catch (e) {
    alert(`No se pudo borrar: ${e.message}`);
  }
}

// =========================================================
// PRODUCTOS
// =========================================================
async function cargarProductos() {
  const tbody = document.getElementById('tbody-productos');
  tbody.innerHTML = '<tr><td colspan="9" class="cargando">Cargando…</td></tr>';
  try {
    const data = await api.get('/api/productos');
    productosCache = (data && data.productos) || [];
    renderProductos();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="mensaje error">Error: ${e.message}</div></td></tr>`;
  }
}

const JERARQUIA_LABEL = { primario: 'Primario', secundario: 'Secundario', terciario: 'Terciario' };

function renderProductos() {
  const tbody = document.getElementById('tbody-productos');
  const filtroCategoria = document.getElementById('filtro-categoria-productos').value;
  const lista = filtroCategoria
    ? productosCache.filter((p) => String(p.categoria_id) === filtroCategoria)
    : productosCache;

  if (lista.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="vacio">No hay productos cargados todavía.</td></tr>';
    return;
  }

  tbody.innerHTML = lista
    .map(
      (p) => `
    <tr>
      <td class="mono">${escapeHtml(p.codigo)}</td>
      <td>${escapeHtml(p.descripcion)}</td>
      <td>${p.categoria_nombre ? escapeHtml(p.categoria_nombre) : '<span class="nota-inline">Transversal</span>'}</td>
      <td>${escapeHtml(p.unidad_medida)}</td>
      <td>${JERARQUIA_LABEL[p.jerarquia] || p.jerarquia}</td>
      <td class="num">${fmtMoneda(p.precio)}</td>
      <td>${p.paginas_minimas ?? '—'}</td>
      <td><span class="badge ${p.habilitado ? 'badge-pagado' : 'badge-no-pagado'}">${p.habilitado ? 'Habilitado' : 'Deshabilitado'}</span></td>
      <td class="acciones-col">
        <button class="chico" data-editar-producto="${p.id}">Editar</button>
        <button class="chico peligro" data-borrar-producto="${p.id}">Borrar</button>
      </td>
    </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-editar-producto]').forEach((btn) =>
    btn.addEventListener('click', () => abrirModalProducto(Number(btn.dataset.editarProducto)))
  );
  tbody.querySelectorAll('[data-borrar-producto]').forEach((btn) =>
    btn.addEventListener('click', () => borrarProducto(Number(btn.dataset.borrarProducto)))
  );
}

function actualizarHintCategoriaProducto() {
  const esPrimario = document.getElementById('p-jerarquia').value === 'primario';
  document.getElementById('p-categoria-hint').textContent = esPrimario
    ? '(un primario necesita categoría — no puede ser transversal)'
    : '(vacío = transversal, disponible para todas)';
}

function abrirModalProducto(id) {
  const producto = id ? productosCache.find((p) => p.id === id) : null;
  document.getElementById('modal-producto-titulo').textContent = producto ? 'Editar producto' : 'Nuevo producto';
  document.getElementById('modal-producto-error').className = 'mensaje error oculto';
  document.getElementById('p-id').value = producto ? producto.id : '';
  document.getElementById('p-codigo').value = producto ? producto.codigo : '';
  document.getElementById('p-codigo').disabled = !!producto; // código inmutable al editar
  document.getElementById('p-descripcion').value = producto ? producto.descripcion : '';
  document.getElementById('p-unidad').value = producto ? producto.unidad_medida : '';
  document.getElementById('p-jerarquia').value = producto ? producto.jerarquia : 'secundario';
  document.getElementById('p-categoria').value = producto && producto.categoria_id ? producto.categoria_id : '';
  document.getElementById('p-precio').value = producto ? producto.precio : '';
  document.getElementById('p-paginas-minimas').value =
    producto && producto.paginas_minimas !== null && producto.paginas_minimas !== undefined
      ? producto.paginas_minimas
      : '';
  document.getElementById('p-habilitado').checked = producto ? !!producto.habilitado : true;
  actualizarHintCategoriaProducto();
  document.getElementById('modal-producto-fondo').classList.remove('oculto');
}

async function guardarProducto(e) {
  e.preventDefault();
  const id = document.getElementById('p-id').value;
  const paginasMinimasRaw = document.getElementById('p-paginas-minimas').value;
  const body = {
    descripcion: document.getElementById('p-descripcion').value.trim(),
    unidad_medida: document.getElementById('p-unidad').value.trim(),
    jerarquia: document.getElementById('p-jerarquia').value,
    categoria_id: document.getElementById('p-categoria').value || '',
    precio: Number(document.getElementById('p-precio').value),
    paginas_minimas: paginasMinimasRaw === '' ? '' : Number(paginasMinimasRaw),
    habilitado: document.getElementById('p-habilitado').checked,
  };
  if (!id) body.codigo = document.getElementById('p-codigo').value.trim();

  const errorBox = document.getElementById('modal-producto-error');
  errorBox.className = 'mensaje error oculto';

  try {
    if (id) {
      await api.put(`/api/productos/${id}`, body);
    } else {
      await api.post('/api/productos', body);
    }
    cerrarModal('modal-producto-fondo');
    await cargarProductos();
  } catch (e2) {
    errorBox.textContent = e2.message;
    errorBox.className = 'mensaje error';
  }
}

async function borrarProducto(id) {
  const producto = productosCache.find((p) => p.id === id);
  if (!confirm(`¿Borrar "${producto?.descripcion}"? Si ya fue usado en pedidos, se deshabilitará en vez de borrarse.`)) {
    return;
  }
  try {
    await api.del(`/api/productos/${id}`);
    await cargarProductos();
  } catch (e) {
    alert(`No se pudo borrar: ${e.message}`);
  }
}

// =========================================================
// REGLAS DE PRODUCCIÓN
// =========================================================
async function cargarReglas() {
  const tbody = document.getElementById('tbody-reglas');
  tbody.innerHTML = '<tr><td colspan="6" class="cargando">Cargando…</td></tr>';
  try {
    const data = await api.get('/api/reglas-produccion');
    reglasCache = (data && data.reglas) || [];
    renderReglas();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="mensaje error">Error: ${e.message}</div></td></tr>`;
  }
}

function renderReglas() {
  const tbody = document.getElementById('tbody-reglas');
  if (reglasCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="vacio">No hay reglas de producción cargadas.</td></tr>';
    return;
  }
  tbody.innerHTML = reglasCache
    .map(
      (r) => `
    <tr>
      <td>${escapeHtml(r.categoria_nombre)}</td>
      <td class="num">${r.carillas_desde}</td>
      <td class="num">${r.carillas_hasta ?? 'Sin techo'}</td>
      <td class="num">${r.horas_minimas}hs</td>
      <td><span class="badge ${r.activa ? 'badge-pagado' : 'badge-no-pagado'}">${r.activa ? 'Activa' : 'Inactiva'}</span></td>
      <td class="acciones-col">
        <button class="chico" data-editar-regla="${r.id}">Editar</button>
        <button class="chico peligro" data-borrar-regla="${r.id}">Borrar</button>
      </td>
    </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-editar-regla]').forEach((btn) =>
    btn.addEventListener('click', () => abrirModalRegla(Number(btn.dataset.editarRegla)))
  );
  tbody.querySelectorAll('[data-borrar-regla]').forEach((btn) =>
    btn.addEventListener('click', () => borrarRegla(Number(btn.dataset.borrarRegla)))
  );
}

function abrirModalRegla(id) {
  if (categoriasCache.length === 0) {
    alert('Primero tenés que crear al menos una categoría.');
    return;
  }
  const regla = id ? reglasCache.find((r) => r.id === id) : null;
  document.getElementById('modal-regla-titulo').textContent = regla ? 'Editar regla' : 'Nueva regla';
  document.getElementById('modal-regla-error').className = 'mensaje error oculto';
  document.getElementById('r-id').value = regla ? regla.id : '';
  document.getElementById('r-categoria').value = regla ? regla.categoria_id : categoriasCache[0].id;
  document.getElementById('r-desde').value = regla ? regla.carillas_desde : '0';
  document.getElementById('r-hasta').value = regla && regla.carillas_hasta !== null ? regla.carillas_hasta : '';
  document.getElementById('r-horas').value = regla ? regla.horas_minimas : '0';
  document.getElementById('r-activa').checked = regla ? !!regla.activa : true;
  document.getElementById('modal-regla-fondo').classList.remove('oculto');
}

async function guardarRegla(e) {
  e.preventDefault();
  const id = document.getElementById('r-id').value;
  const hastaRaw = document.getElementById('r-hasta').value;
  const body = {
    categoria_id: Number(document.getElementById('r-categoria').value),
    carillas_desde: Number(document.getElementById('r-desde').value),
    carillas_hasta: hastaRaw === '' ? '' : Number(hastaRaw),
    horas_minimas: Number(document.getElementById('r-horas').value),
    activa: document.getElementById('r-activa').checked,
  };
  const errorBox = document.getElementById('modal-regla-error');
  errorBox.className = 'mensaje error oculto';
  try {
    if (id) await api.put(`/api/reglas-produccion/${id}`, body);
    else await api.post('/api/reglas-produccion', body);
    cerrarModal('modal-regla-fondo');
    await cargarReglas();
  } catch (e2) {
    errorBox.textContent = e2.message;
    errorBox.className = 'mensaje error';
  }
}

async function borrarRegla(id) {
  if (!confirm('¿Borrar esta regla de producción?')) return;
  try {
    await api.del(`/api/reglas-produccion/${id}`);
    await cargarReglas();
  } catch (e) {
    alert(`No se pudo borrar: ${e.message}`);
  }
}
