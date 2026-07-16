// public/js/pedido.js

const ESTADO_LABEL = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  listo: "Listo",
  entregado: "Entregado",
};

const DIA_LABEL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function fmtMoneda(n) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n || 0);
}

function fmtFecha(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function fmtFechaHora(iso) {
  if (!iso) return "—";
  // SQLite datetime('now') → "YYYY-MM-DD HH:MM:SS" (UTC)
  return iso.replace("T", " ").slice(0, 16);
}

function getPedidoId() {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  return id ? Number(id) : null;
}

function mostrarToast(mensaje, esError = false) {
  const existente = document.querySelector(".toast");
  if (existente) existente.remove();

  const toast = document.createElement("div");
  toast.className = "toast" + (esError ? " error" : "");
  toast.textContent = mensaje;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

function renderCliente(cliente) {
  return `
    <div class="card">
      <h2>Cliente</h2>
      <dl>
        <dt>Nombre</dt><dd>${cliente.nombre} ${cliente.apellido}</dd>
        <dt>Documento</dt><dd>${cliente.documento}</dd>
        <dt>Email</dt><dd>${cliente.email || "—"}</dd>
        <dt>Celular</dt><dd>${cliente.celular || "—"}</dd>
      </dl>
    </div>
  `;
}

function renderEntrega(p) {
  const turno = p.turno
    ? `${DIA_LABEL[p.turno.dia_semana]} ${p.turno.hora_inicio}–${p.turno.hora_fin}`
    : "—";
  return `
    <div class="card">
      <h2>Entrega</h2>
      <dl>
        <dt>Dirección</dt><dd>${p.direccion_entrega || "—"}</dd>
        <dt>Zona</dt><dd>${p.zona ? p.zona.nombre : "—"}</dd>
        <dt>Turno</dt><dd>${turno}</dd>
        <dt>Fecha de entrega</dt><dd>${fmtFecha(p.fecha_entrega)}</dd>
      </dl>
    </div>
  `;
}

function renderPago(p) {
  const badgePago = `<span class="badge ${p.pagado ? "pagado-si" : "pagado-no"}">${p.pagado ? "Pagado" : "No pagado"}</span>`;
  const detalle = p.pago
    ? `
        <dt>Método</dt><dd>${p.pago.mp_payment_type || "—"}</dd>
        <dt>Estado MP</dt><dd>${p.pago.mp_status || "—"}${p.pago.mp_status_detail ? " (" + p.pago.mp_status_detail + ")" : ""}</dd>
        <dt>Monto</dt><dd>${fmtMoneda(p.pago.monto)} ${p.pago.moneda || ""}</dd>
        <dt>Fecha</dt><dd>${fmtFechaHora(p.pago.creado_en)}</dd>
      `
    : `<dt>Registro de pago</dt><dd>No hay ningún pago registrado todavía para este pedido.</dd>`;

  return `
    <div class="card">
      <h2>Pago</h2>
      <p style="margin: 0 0 10px 0;">${badgePago}</p>
      <dl>${detalle}</dl>
    </div>
  `;
}

function renderEstadoForm(p) {
  const opciones = Object.entries(ESTADO_LABEL)
    .map(([valor, label]) => `<option value="${valor}" ${valor === p.estado ? "selected" : ""}>${label}</option>`)
    .join("");

  return `
    <div class="estado-form">
      <select id="select-estado">${opciones}</select>
      <button class="primary" id="btn-guardar-estado">Guardar estado</button>
    </div>
  `;
}

function renderArchivos(archivos) {
  if (!archivos || archivos.length === 0) {
    return `<p class="estado-vacio" style="padding: 16px 0;">Este pedido no tiene archivos cargados.</p>`;
  }

  const filas = archivos
    .map((a) => {
      if (a.error_confirmacion) {
        return `
          <li>
            <div class="archivo-info">
              <div class="nombre">${a.nombre || "(sin nombre)"}</div>
              <div class="meta" style="color: var(--rojo-alerta);">⚠ Error al confirmar: ${a.error_confirmacion}</div>
            </div>
          </li>
        `;
      }
      const meta = [
        a.rango ? `páginas ${a.rango}` : `${a.paginas} pág.`,
        `${a.copias} copia(s)`,
        a.faz,
        a.acabado,
      ]
        .filter(Boolean)
        .join(" · ");

      return `
        <li>
          <div class="archivo-info">
            <div class="nombre">${a.nombre}</div>
            <div class="meta">${meta}</div>
          </div>
          ${
            a.descarga_url
              ? `<button data-key="${a.r2_key}" data-nombre="${a.nombre}" class="btn-descargar">Descargar</button>`
              : `<span class="meta" style="color: var(--rojo-alerta);">Sin archivo en R2</span>`
          }
        </li>
      `;
    })
    .join("");

  return `<ul class="lista-archivos">${filas}</ul>`;
}

function renderItems(items, total) {
  if (!items || items.length === 0) {
    return `<p class="estado-vacio" style="padding: 16px 0;">Sin desglose de items.</p>`;
  }

  const filas = items
    .map(
      (it) => `
        <tr>
          <td>${it.nombre}</td>
          <td>${it.carillas ?? "—"}</td>
          <td>${it.copias ?? "—"}</td>
          <td>${fmtMoneda(it.subtotal_primario)}</td>
          <td>${it.producto_secundario || "—"}<br><span style="color:var(--gris-texto); font-size:12px;">${fmtMoneda(it.subtotal_secundario)}</span></td>
          <td>${fmtMoneda(it.total)}</td>
        </tr>
      `
    )
    .join("");

  return `
    <table>
      <thead>
        <tr>
          <th>Archivo</th>
          <th>Carillas</th>
          <th>Copias</th>
          <th>Subt. primario</th>
          <th>Secundario</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${filas}
        <tr class="total-row">
          <td colspan="5">Total del pedido</td>
          <td>${fmtMoneda(total)}</td>
        </tr>
      </tbody>
    </table>
  `;
}

function render(p) {
  const contenido = document.getElementById("contenido");

  const alertaConfig = p.items?.error_configuracion
    ? `<div class="alerta">⚠ ${p.items.error_configuracion}</div>`
    : "";

  contenido.innerHTML = `
    ${alertaConfig}
    <div class="detalle-header">
      <div>
        <h1>Pedido #${p.id}</h1>
        <p class="subtitulo">Creado el ${fmtFechaHora(p.creado_en)} · última actualización ${fmtFechaHora(p.actualizado_en)}</p>
      </div>
      ${renderEstadoForm(p)}
    </div>

    <div class="grid-cards">
      ${renderCliente(p.cliente)}
      ${renderEntrega(p)}
      ${renderPago(p)}
    </div>

    ${
      p.observaciones
        ? `<div class="seccion"><h2>Observaciones</h2><p>${p.observaciones}</p></div>`
        : ""
    }

    <div class="seccion">
      <h2>Archivos</h2>
      ${renderArchivos(p.archivos)}
    </div>

    <div class="seccion">
      <h2>Desglose</h2>
      ${renderItems(p.items, p.total)}
    </div>
  `;

  document.getElementById("btn-guardar-estado").addEventListener("click", () => guardarEstado(p.id));

  contenido.querySelectorAll(".btn-descargar").forEach((btn) => {
    btn.addEventListener("click", () => descargarArchivo(p.id, btn.dataset.key, btn.dataset.nombre, btn));
  });
}

async function cargarPedido(id) {
  const contenido = document.getElementById("contenido");
  contenido.innerHTML = `<div class="estado-cargando">Cargando pedido…</div>`;

  try {
    const res = await window.panelAuth.apiFetch(`/api/pedidos/${id}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      contenido.innerHTML = `<div class="estado-error">Error cargando el pedido: ${err.error || res.status}</div>`;
      return;
    }
    const pedido = await res.json();
    render(pedido);
  } catch (err) {
    contenido.innerHTML = `<div class="estado-error">Error de conexión: ${err.message}</div>`;
  }
}

async function guardarEstado(id) {
  const select = document.getElementById("select-estado");
  const boton = document.getElementById("btn-guardar-estado");
  const nuevoEstado = select.value;

  boton.disabled = true;
  boton.textContent = "Guardando…";

  try {
    const res = await window.panelAuth.apiFetch(`/api/pedidos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado: nuevoEstado }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      mostrarToast(err.error || "No se pudo actualizar el estado", true);
      return;
    }

    mostrarToast(`Estado actualizado a "${ESTADO_LABEL[nuevoEstado]}"`);
    await cargarPedido(id);
  } catch (err) {
    mostrarToast("Error de conexión: " + err.message, true);
  } finally {
    boton.disabled = false;
    boton.textContent = "Guardar estado";
  }
}

async function descargarArchivo(id, key, nombre, boton) {
  const textoOriginal = boton.textContent;
  boton.disabled = true;
  boton.textContent = "Descargando…";

  try {
    const res = await window.panelAuth.apiFetch(`/api/pedidos/${id}/archivo?key=${encodeURIComponent(key)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      mostrarToast(err.error || "No se pudo descargar el archivo", true);
      return;
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre || "archivo";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    mostrarToast("Error de conexión: " + err.message, true);
  } finally {
    boton.disabled = false;
    boton.textContent = textoOriginal;
  }
}

(async () => {
  await window.panelAuth.requireAuth();

  const user = await window.panelAuth.getUser();
  if (user) document.getElementById("user-email").textContent = user.email || "";
  document.getElementById("btn-logout").addEventListener("click", () => window.panelAuth.logout());

  const id = getPedidoId();
  if (!id) {
    document.getElementById("contenido").innerHTML = `<div class="estado-error">Falta el id del pedido en la URL.</div>`;
    return;
  }

  await cargarPedido(id);
})();
