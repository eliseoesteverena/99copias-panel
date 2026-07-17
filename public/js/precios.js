let productosCache = [];

document.addEventListener('DOMContentLoaded', () => {
  cargarProductos();
  document.getElementById('btn-nuevo').addEventListener('click', () => abrirModal(null));
  document.getElementById('btn-cancelar').addEventListener('click', cerrarModal);
  document.getElementById('form-producto').addEventListener('submit', guardarProducto);
  document.getElementById('modal-fondo').addEventListener('click', (e) => {
    if (e.target.id === 'modal-fondo') cerrarModal();
  });
});

const JERARQUIA_LABEL = { primario: 'Primario', secundario: 'Secundario', terciario: 'Terciario' };

async function cargarProductos() {
  const tbody = document.getElementById('tbody-productos');
  const estado = document.getElementById('estado');
  estado.className = 'mensaje oculto';
  tbody.innerHTML = '<tr><td colspan="6" class="cargando">Cargando…</td></tr>';

  try {
    const data = await api.get('/api/productos');
    productosCache = data.productos || [];
    renderTabla();
  } catch (e) {
    estado.className = 'mensaje error';
    estado.textContent = `No se pudieron cargar los productos: ${e.message}`;
    tbody.innerHTML = '';
  }
}

function renderTabla() {
  const tbody = document.getElementById('tbody-productos');
  if (productosCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="vacio">No hay productos cargados todavía.</td></tr>';
    return;
  }

  tbody.innerHTML = productosCache
    .map(
      (p) => `
    <tr>
      <td>${escapeHtml(p.descripcion)}</td>
      <td>${escapeHtml(p.unidad_medida)}</td>
      <td>${JERARQUIA_LABEL[p.jerarquia] || p.jerarquia}</td>
      <td class="num">${fmtMoneda(p.precio)}</td>
      <td><span class="badge ${p.habilitado ? 'badge-pagado' : 'badge-no-pagado'}">${p.habilitado ? 'Habilitado' : 'Deshabilitado'}</span></td>
      <td>
        <div style="display:flex;gap:4px;justify-content:flex-end;">
          <button class="chico" data-editar="${p.id}">Editar</button>
          <button class="chico peligro" data-borrar="${p.id}">Borrar</button>
        </div>
      </td>
    </tr>`
    )
    .join('');

  tbody.querySelectorAll('[data-editar]').forEach((btn) => {
    btn.addEventListener('click', () => abrirModal(Number(btn.dataset.editar)));
  });
  tbody.querySelectorAll('[data-borrar]').forEach((btn) => {
    btn.addEventListener('click', () => borrarProducto(Number(btn.dataset.borrar)));
  });
}

function abrirModal(id) {
  const producto = id ? productosCache.find((p) => p.id === id) : null;
  document.getElementById('modal-titulo').textContent = producto ? 'Editar producto' : 'Nuevo producto';
  document.getElementById('modal-error').className = 'mensaje error oculto';
  document.getElementById('p-id').value = producto ? producto.id : '';
  document.getElementById('p-descripcion').value = producto ? producto.descripcion : '';
  document.getElementById('p-unidad').value = producto ? producto.unidad_medida : '';
  document.getElementById('p-jerarquia').value = producto ? producto.jerarquia : 'secundario';
  document.getElementById('p-precio').value = producto ? producto.precio : '';
  document.getElementById('p-habilitado').checked = producto ? !!producto.habilitado : true;
  document.getElementById('modal-fondo').classList.remove('oculto');
}

function cerrarModal() {
  document.getElementById('modal-fondo').classList.add('oculto');
}

async function guardarProducto(e) {
  e.preventDefault();
  const id = document.getElementById('p-id').value;
  const body = {
    descripcion: document.getElementById('p-descripcion').value.trim(),
    unidad_medida: document.getElementById('p-unidad').value.trim(),
    jerarquia: document.getElementById('p-jerarquia').value,
    precio: Number(document.getElementById('p-precio').value),
    habilitado: document.getElementById('p-habilitado').checked,
  };

  const errorBox = document.getElementById('modal-error');
  errorBox.className = 'mensaje error oculto';

  try {
    if (id) {
      await api.put(`/api/productos/${id}`, body);
    } else {
      await api.post('/api/productos', body);
    }
    cerrarModal();
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
