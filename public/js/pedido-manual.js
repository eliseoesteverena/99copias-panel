// pedido-manual.js — carga manual de pedidos (ej. los que entran por WhatsApp).
//
// Agrega el botón "＋ Nuevo pedido" arriba de la lista y un formulario en un <dialog>.
// El alta va a POST /api/trabajos (requiere sesión; el servidor la verifica) y de ahí al
// Wizard, que calcula el precio con la misma lógica que la web y guarda el pedido con la
// configuración de cada producto (copias, páginas, acabado…) para reportes a futuro.
//
// Depende de api.js (api, escapeHtml). Lo inicia pedidos.js: PedidoManual.init({ onCreado }).

const PedidoManual = (() => {
  const ORIGENES = [['whatsapp', 'WhatsApp'], ['mostrador', 'Mostrador'], ['telefono', 'Teléfono'], ['otro', 'Otro']];
  const MEDIOS = [['efectivo', 'Efectivo'], ['transferencia', 'Transferencia'], ['mercadopago', 'Mercado Pago'], ['otro', 'Otro']];
  const ESTADOS = [['', 'Automático'], ['pendiente', 'Pendiente'], ['en_proceso', 'En proceso'], ['listo', 'Listo'], ['entregado', 'Entregado']];

  let dlg = null;
  let onCreado = null;
  let datos = { categorias: [], productos: [], zonas: [] };
  let cargados = false;

  const $ = (sel) => dlg.querySelector(sel);
  const opciones = (pares, sel) => pares.map(([v, t]) => `<option value="${escapeHtml(v)}"${v === sel ? ' selected' : ''}>${escapeHtml(t)}</option>`).join('');

  // ---------- Catálogo ----------
  async function cargarDatos() {
    if (cargados) return;
    const [c, p, z] = await Promise.all([api.get('/api/categorias'), api.get('/api/productos'), api.get('/api/zonas')]);
    datos = { categorias: c.categorias || [], productos: p.productos || [], zonas: z.zonas || [] };
    cargados = true;
  }

  function categoriaActual() { return $('#pm-categoria').value; }

  function productosDe(jerarquia) {
    const cat = categoriaActual();
    const habilitados = datos.productos.filter((p) => p.jerarquia === jerarquia && p.habilitado !== 0);
    const propios = habilitados.filter((p) => (jerarquia === 'primario' ? String(p.categoria_id) === cat : p.categoria_id == null || String(p.categoria_id) === cat));
    // Si el catálogo no trae categoria_id, mostramos todos y valida el servidor.
    return propios.length || jerarquia === 'secundario' ? propios : habilitados;
  }

  function selectProductos(jerarquia, actual) {
    const lista = productosDe(jerarquia);
    const porDefecto = jerarquia === 'secundario' && !actual ? (lista.find((p) => p.codigo === 'suelto') || lista[0]) : null;
    const elegido = actual || (porDefecto && String(porDefecto.id)) || '';
    return lista.map((p) => `<option value="${p.id}"${String(p.id) === String(elegido) ? ' selected' : ''}>${escapeHtml(p.descripcion)}</option>`).join('')
      || '<option value="">(sin productos en esta categoría)</option>';
  }

  // ---------- Líneas ----------
  function lineaHtml() {
    return `
      <div class="pm-linea">
        <div class="pm-linea-top">
          <input type="text" class="pm-l-nombre" placeholder="Archivo o detalle (opcional)" maxlength="150">
          <button type="button" class="chico fantasma pm-l-quitar" title="Quitar este producto">✕</button>
        </div>
        <div class="pm-grid">
          <label>Impresión<select class="pm-l-primario">${selectProductos('primario')}</select></label>
          <label>Acabado<select class="pm-l-acabado">${selectProductos('secundario')}</select></label>
          <label>Páginas<input type="number" class="pm-l-paginas" min="1" step="1" inputmode="numeric" placeholder="ej. 20"></label>
          <label>Copias<input type="number" class="pm-l-copias" min="1" step="1" inputmode="numeric" value="1"></label>
          <label>Págs. por carilla<select class="pm-l-ppc"><option>1</option><option>2</option><option>4</option><option>6</option></select></label>
          <label>Faz<select class="pm-l-faz"><option value="simple">Simple</option><option value="doble">Doble</option></select></label>
          <label class="pm-ancho">Rango (opcional)<input type="text" class="pm-l-rango" placeholder="ej. 1-10, 15" maxlength="100"></label>
        </div>
      </div>`;
  }

  function agregarLinea() {
    $('#pm-lineas').insertAdjacentHTML('beforeend', lineaHtml());
    const lineas = $('#pm-lineas').querySelectorAll('.pm-linea');
    lineas[lineas.length - 1].querySelector('.pm-l-quitar').addEventListener('click', (e) => {
      if ($('#pm-lineas').querySelectorAll('.pm-linea').length > 1) e.target.closest('.pm-linea').remove();
    });
  }

  function refrescarProductosEnLineas() {
    dlg.querySelectorAll('.pm-linea').forEach((l) => {
      l.querySelector('.pm-l-primario').innerHTML = selectProductos('primario');
      l.querySelector('.pm-l-acabado').innerHTML = selectProductos('secundario');
    });
  }

  // ---------- Formulario ----------
  function formularioHtml() {
    const hoy = new Date().toISOString().slice(0, 10);
    return `
      <form method="dialog" id="pm-form" novalidate>
        <header class="pm-header"><h2>Nuevo pedido manual</h2><button type="button" class="chico fantasma" id="pm-cerrar">✕</button></header>

        <fieldset><legend>Pedido</legend>
          <div class="pm-grid">
            <label>Origen<select id="pm-origen">${opciones(ORIGENES, 'whatsapp')}</select></label>
            <label>Categoría<select id="pm-categoria">${datos.categorias.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}</option>`).join('')}</select></label>
            <label>Fecha del pedido<input type="date" id="pm-fecha-pedido" max="${hoy}" title="Dejá vacío para usar hoy"></label>
            <label>Estado inicial<select id="pm-estado">${opciones(ESTADOS, '')}</select></label>
          </div>
        </fieldset>

        <fieldset><legend>Productos <small>(se guarda la configuración de cada uno para reportes)</small></legend>
          <div id="pm-lineas"></div>
          <button type="button" class="chico" id="pm-agregar-linea">＋ Agregar producto</button>
        </fieldset>

        <fieldset><legend>Cliente</legend>
          <div class="pm-grid">
            <label>Nombre *<input type="text" id="pm-c-nombre" maxlength="100" autocomplete="off"></label>
            <label>Apellido<input type="text" id="pm-c-apellido" maxlength="100" autocomplete="off"></label>
            <label>Celular<input type="tel" id="pm-c-celular" maxlength="40" inputmode="tel"></label>
            <label>Email<input type="email" id="pm-c-email" maxlength="150"></label>
            <label>Documento<select id="pm-c-doctipo"><option value="dni">DNI</option><option value="cuit">CUIT</option></select></label>
            <label>Número<input type="text" id="pm-c-docnum" maxlength="20" inputmode="numeric" placeholder="Si ya tiene cuenta, se vincula"></label>
          </div>
        </fieldset>

        <fieldset><legend>Entrega <small>(opcional)</small></legend>
          <div class="pm-grid">
            <label>Zona<select id="pm-zona"><option value="">Sin definir</option>${datos.zonas.map((z) => `<option value="${z.id}">${escapeHtml(z.nombre)}</option>`).join('')}</select></label>
            <label>Fecha de entrega<input type="date" id="pm-fecha-entrega"></label>
            <label class="pm-ancho">Dirección<input type="text" id="pm-direccion" maxlength="300" placeholder="Solo si es envío"></label>
          </div>
        </fieldset>

        <fieldset><legend>Pago</legend>
          <div class="pm-grid">
            <label class="pm-check"><input type="checkbox" id="pm-pagado"> Ya está pagado</label>
            <label>Medio de pago<select id="pm-medio"><option value="">—</option>${opciones(MEDIOS, '')}</select></label>
            <label>Total acordado <small>(opcional)</small><input type="number" id="pm-total" min="0" step="0.01" inputmode="decimal" placeholder="Si es distinto al calculado"></label>
            <label>Motivo del ajuste<input type="text" id="pm-motivo" maxlength="300" placeholder="ej. descuento acordado"></label>
          </div>
        </fieldset>

        <label class="pm-bloque">Observaciones<textarea id="pm-obs" rows="2" maxlength="1000"></textarea></label>

        <div id="pm-error" class="mensaje error oculto" role="alert"></div>
        <footer class="pm-footer">
          <small>El precio se calcula al guardar. No se le avisa al cliente.</small>
          <button type="button" class="chico fantasma" id="pm-cancelar">Cancelar</button>
          <button type="submit" class="primario" id="pm-guardar">Crear pedido</button>
        </footer>
      </form>`;
  }

  function mostrarError(msg) {
    const box = $('#pm-error');
    box.textContent = msg;
    box.classList.toggle('oculto', !msg);
    if (msg) box.scrollIntoView({ block: 'nearest' });
  }

  function recolectar() {
    const num = (v) => (v === '' || v == null ? undefined : Number(v));
    const lineas = [...dlg.querySelectorAll('.pm-linea')].map((l) => ({
      nombre: l.querySelector('.pm-l-nombre').value.trim() || undefined,
      producto_primario_id: num(l.querySelector('.pm-l-primario').value),
      acabado_id: num(l.querySelector('.pm-l-acabado').value),
      paginas: num(l.querySelector('.pm-l-paginas').value),
      copias: num(l.querySelector('.pm-l-copias').value),
      paginas_por_carilla: num(l.querySelector('.pm-l-ppc').value),
      faz: l.querySelector('.pm-l-faz').value,
      rango: l.querySelector('.pm-l-rango').value.trim() || undefined,
    }));
    return {
      categoria_id: num(categoriaActual()),
      origen: $('#pm-origen').value,
      fecha_pedido: $('#pm-fecha-pedido').value || undefined,
      estado: $('#pm-estado').value || undefined,
      lineas,
      cliente: {
        nombre: $('#pm-c-nombre').value.trim(),
        apellido: $('#pm-c-apellido').value.trim() || undefined,
        celular: $('#pm-c-celular').value.trim() || undefined,
        email: $('#pm-c-email').value.trim() || undefined,
        documento_tipo: $('#pm-c-doctipo').value,
        documento_numero: $('#pm-c-docnum').value.trim() || undefined,
      },
      zona_id: num($('#pm-zona').value),
      fecha_entrega: $('#pm-fecha-entrega').value || undefined,
      direccion_entrega: $('#pm-direccion').value.trim() || undefined,
      pagado: $('#pm-pagado').checked,
      medio_pago: $('#pm-medio').value || undefined,
      total_final: num($('#pm-total').value),
      motivo_ajuste: $('#pm-motivo').value.trim() || undefined,
      observaciones: $('#pm-obs').value.trim() || undefined,
    };
  }

  async function enviar(e) {
    e.preventDefault();
    mostrarError('');
    const payload = recolectar();
    if (!payload.cliente.nombre) return mostrarError('Indicá el nombre del cliente.');
    const boton = $('#pm-guardar');
    boton.disabled = true;
    boton.textContent = 'Guardando…';
    try {
      // Quién lo carga (informativo): email del usuario logueado en el Panel.
      try {
        const u = window.Auth && (await Auth.getUser());
        if (u && u.email) payload.creado_por = u.email;
      } catch { /* sin dato de usuario: queda vacío */ }
      const r = await api.post('/api/trabajos', payload);
      dlg.close();
      if (onCreado) await onCreado(r.trabajo_id);
      if (r.pago_registrado === false) {
        alert(`El pedido #${r.trabajo_id} se creó y figura como pagado, pero no se pudo registrar la fila en la tabla de pagos ` +
          `(la base rechazó ese medio de pago). Avisá para revisar la restricción de pagos.medio.`);
      }
    } catch (err) {
      mostrarError(err.message);
    } finally {
      boton.disabled = false;
      boton.textContent = 'Crear pedido';
    }
  }

  async function abrir() {
    try {
      await cargarDatos();
    } catch (err) {
      alert(`No se pudo cargar el catálogo: ${err.message}`);
      return;
    }
    dlg.innerHTML = formularioHtml();
    agregarLinea();
    $('#pm-categoria').addEventListener('change', refrescarProductosEnLineas);
    $('#pm-agregar-linea').addEventListener('click', agregarLinea);
    $('#pm-cerrar').addEventListener('click', () => dlg.close());
    $('#pm-cancelar').addEventListener('click', () => dlg.close());
    $('#pm-form').addEventListener('submit', enviar);
    // Retiro en local: la dirección no aplica.
    $('#pm-zona').addEventListener('change', (ev) => {
      const z = datos.zonas.find((x) => String(x.id) === ev.target.value);
      $('#pm-direccion').disabled = !!(z && z.es_retiro);
      if (z && z.es_retiro) $('#pm-direccion').value = '';
    });
    // Marcar "pagado" sugiere elegir medio.
    $('#pm-pagado').addEventListener('change', (ev) => { if (ev.target.checked && !$('#pm-medio').value) $('#pm-medio').focus(); });
    dlg.showModal();
  }

  function init(opciones = {}) {
    onCreado = opciones.onCreado || null;
    const contenedor = document.querySelector('.filtros');
    if (!contenedor || document.getElementById('btn-nuevo-pedido')) return;
    contenedor.insertAdjacentHTML('afterbegin', '<button type="button" class="chico primario pm-btn-nuevo" id="btn-nuevo-pedido">＋ Nuevo pedido</button>');
    dlg = document.createElement('dialog');
    dlg.id = 'dlg-pedido-manual';
    dlg.className = 'pm-dialog';
    document.body.appendChild(dlg);
    document.getElementById('btn-nuevo-pedido').addEventListener('click', abrir);
  }

  return { init };
})();

window.PedidoManual = PedidoManual;
