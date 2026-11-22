// Reporte de ventas. Los controles de fecha son globales; cambiar de "vista"
// solo cambia qué se consulta (ventas totales / por producto) sobre el mismo rango.
const estado = { rango: 'actual', vista: 'total', desde: '', hasta: '' };
let pedidoEnCurso = 0;

const MEDIOS = { mercadopago: 'Mercado Pago', transferencia: 'Transferencia', efectivo: 'Efectivo', otro: 'Otro', sin_dato: 'Sin dato' };
const ORIGENES = { web: 'Web', whatsapp: 'WhatsApp', mostrador: 'Mostrador', telefono: 'Teléfono', manual: 'Manual', otro: 'Otro' };
const fmtN = (n) => new Intl.NumberFormat('es-AR').format(n || 0);
const $ = (id) => document.getElementById(id);

// Hoy en Argentina (no en la hora del dispositivo)
function hoyAR() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}
const pad = (n) => String(n).padStart(2, '0');

function calcularRango(tipo) {
  const [y, m] = hoyAR().split('-').map(Number);
  if (tipo === 'actual') return { desde: `${y}-${pad(m)}-01`, hasta: hoyAR() };
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const ultimo = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  return { desde: `${py}-${pad(pm)}-01`, hasta: `${py}-${pad(pm)}-${pad(ultimo)}` };
}

function aplicarRango(tipo) {
  estado.rango = tipo;
  document.querySelectorAll('#seg-rango button').forEach((b) => b.classList.toggle('activo', b.dataset.rango === tipo));
  const custom = tipo === 'custom';
  $('f-desde').disabled = !custom;
  $('f-hasta').disabled = !custom;
  if (!custom) {
    const r = calcularRango(tipo);
    $('f-desde').value = r.desde;
    $('f-hasta').value = r.hasta;
  }
  cargar();
}

async function cargar() {
  const desde = $('f-desde').value;
  const hasta = $('f-hasta').value;
  const err = $('rep-error');
  err.className = 'mensaje error oculto';
  if (!desde || !hasta) return;
  if (desde > hasta) {
    err.textContent = 'La fecha "desde" no puede ser posterior a "hasta".';
    err.className = 'mensaje error';
    return;
  }
  estado.desde = desde;
  estado.hasta = hasta;
  const miPedido = ++pedidoEnCurso; // descarta respuestas viejas si el usuario cambia rápido
  $('rep-contenido').innerHTML = '<p class="cargando">Cargando…</p>';
  try {
    const qs = new URLSearchParams({ desde, hasta, vista: estado.vista });
    const data = await api.get(`/api/reportes/ventas?${qs}`);
    if (miPedido !== pedidoEnCurso) return;
    $('rep-contenido').innerHTML = data.vista === 'total' ? htmlTotal(data) : htmlProductos(data);
  } catch (e) {
    if (miPedido !== pedidoEnCurso) return;
    $('rep-contenido').innerHTML = '';
    err.textContent = 'Error: ' + e.message;
    err.className = 'mensaje error';
  }
}

function tarjeta(titulo, valor, sub) {
  return `<div class="rep-tarjeta"><div class="t">${titulo}</div><div class="v">${valor}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
}

function tablaSimple(titulo, filas, etiquetas, vacio) {
  const cuerpo = filas.length
    ? filas.map((f) => `<tr><td>${escapeHtml(etiquetas[f.k] || f.k)}</td><td class="num">${fmtN(f.pedidos)}</td><td class="num">${fmtMoneda(f.total)}</td></tr>`).join('')
    : `<tr><td colspan="3" class="vacio">${vacio}</td></tr>`;
  return `<section class="seccion"><div class="seccion-header"><h2>${titulo}</h2></div>
    <div class="tabla-wrap"><table><thead><tr><th></th><th class="num">Pedidos</th><th class="num">Total</th></tr></thead><tbody>${cuerpo}</tbody></table></div></section>`;
}

function htmlTotal(d) {
  const r = d.resumen;
  if (!r.pedidos) return '<div class="seccion"><p class="vacio">No hay ventas pagadas en este período.</p></div>';
  const max = Math.max(...d.por_dia.map((x) => x.total));
  const barras = d.por_dia
    .map((x) => `<div class="rep-barra" style="height:${Math.max(2, (x.total / max) * 100)}%" title="${fmtFecha(x.dia)} · ${fmtMoneda(x.total)} · ${x.pedidos} pedido(s)"></div>`)
    .join('');
  return `
    <div class="rep-tarjetas">
      ${tarjeta('Total facturado', fmtMoneda(r.total), 'incluye envío')}
      ${tarjeta('Pedidos', fmtN(r.pedidos))}
      ${tarjeta('Ticket promedio', fmtMoneda(r.ticket))}
      ${tarjeta('Envíos cobrados', fmtMoneda(r.envio))}
    </div>
    <section class="seccion">
      <div class="seccion-header"><h2>Ventas por día</h2></div>
      <div class="rep-barras">${barras}</div>
      <div class="rep-eje"><span>${fmtFecha(d.por_dia[0].dia)}</span><span>${fmtFecha(d.por_dia[d.por_dia.length - 1].dia)}</span></div>
    </section>
    <div class="rep-grid">
      ${tablaSimple('Por medio de pago', d.por_medio.map((x) => ({ ...x, k: x.medio })), MEDIOS, 'Sin datos')}
      ${tablaSimple('Por origen', d.por_origen.map((x) => ({ ...x, k: x.origen })), ORIGENES, 'Sin datos')}
    </div>`;
}

function nombreProducto(r) {
  return `${escapeHtml(r.descripcion || r.codigo)}${r.descripcion ? ` <span class="mono nota-inline">${escapeHtml(r.codigo)}</span>` : ''}`;
}

function htmlProductos(d) {
  const c = d.conciliacion;
  if (!c.pedidos) return '<div class="seccion"><p class="vacio">No hay ventas pagadas en este período.</p></div>';
  const filasP = d.primarios.map((r) => `<tr><td>${nombreProducto(r)}</td><td class="rep-oc">${escapeHtml(r.categoria || '—')}</td>
      <td class="num rep-oc">${fmtN(r.pedidos)}</td><td class="num">${fmtN(r.copias)}</td><td class="num">${fmtN(r.carillas)}</td><td class="num">${fmtMoneda(r.facturado)}</td></tr>`).join('');
  const filasA = d.acabados.map((r) => `<tr><td>${nombreProducto(r)}</td>
      <td class="num rep-oc">${fmtN(r.pedidos)}</td><td class="num">${fmtN(r.unidades)}</td><td class="num">${fmtMoneda(r.facturado)}</td></tr>`).join('');
  const ajuste = Math.round(c.ajustes * 100) / 100;
  return `
    <section class="seccion">
      <div class="seccion-header"><h2>Impresión / productos</h2></div>
      <p class="seccion-nota">Carillas = hojas físicas × copias. En fotos, las carillas son las copias de cada foto.</p>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Producto</th><th class="rep-oc">Categoría</th><th class="num rep-oc">Pedidos</th><th class="num">Copias</th><th class="num">Carillas</th><th class="num">Facturado</th></tr></thead>
        <tbody>${filasP || '<tr><td colspan="6" class="vacio">Sin datos</td></tr>'}</tbody></table></div>
    </section>
    <section class="seccion">
      <div class="seccion-header"><h2>Acabados</h2></div>
      <div class="tabla-wrap"><table>
        <thead><tr><th>Acabado</th><th class="num rep-oc">Pedidos</th><th class="num">Unidades</th><th class="num">Facturado</th></tr></thead>
        <tbody>${filasA || '<tr><td colspan="4" class="vacio">Sin datos</td></tr>'}</tbody></table></div>
    </section>
    <section class="seccion">
      <div class="seccion-header"><h2>Conciliación con ventas totales</h2></div>
      <div class="tabla-wrap"><table><tbody>
        <tr><td>Productos + acabados</td><td class="num">${fmtMoneda(c.items)}</td></tr>
        <tr class="rep-sub"><td>Envíos cobrados</td><td class="num">${fmtMoneda(c.envio)}</td></tr>
        <tr class="rep-sub"><td>Ajustes de precio (precio acordado ≠ calculado)</td><td class="num">${fmtMoneda(ajuste)}</td></tr>
        <tr class="rep-total"><td>Total (${fmtN(c.pedidos)} pedidos)</td><td class="num">${fmtMoneda(c.total)}</td></tr>
      </tbody></table></div>
    </section>`;
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('#seg-rango button').forEach((b) => b.addEventListener('click', () => aplicarRango(b.dataset.rango)));
  document.querySelectorAll('#seg-vista button').forEach((b) =>
    b.addEventListener('click', () => {
      estado.vista = b.dataset.vista;
      document.querySelectorAll('#seg-vista button').forEach((x) => x.classList.toggle('activo', x === b));
      cargar();
    })
  );
  $('f-desde').addEventListener('change', cargar);
  $('f-hasta').addEventListener('change', cargar);
  aplicarRango('actual');
});
