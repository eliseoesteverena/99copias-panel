// public/js/pedidos.js
//
// Vista dividida estilo cliente de mail: lista de pedidos a la izquierda,
// detalle a la derecha. Todo en una sola página (no navega a otra URL al
// hacer click en un pedido).
//
// No hay Authorization header en ningún fetch: la única puerta es el login
// de Auth0 al cargar la página (ver auth.js / requireAuth).

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.js";
}

const ESTADO_LABEL = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  listo: "Listo",
  entregado: "Entregado",
};

const DIA_LABEL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const EXT_IMAGEN = ["jpg", "jpeg", "png", "gif", "webp"];

let pedidoSeleccionadoId = null;

function fmtMoneda(n) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n || 0);
}

function fmtFecha(iso) {
  if (!iso) return "sin fecha";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function fmtFechaHora(iso) {
  if (!iso) return "—";
  return iso.replace("T", " ").slice(0, 16);
}

function extension(nombre) {
  return (nombre || "").split(".").pop().toLowerCase();
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

// ===================== LISTA (columna izquierda) =====================

function construirQuery() {
  const params = new URLSearchParams();
  const estado = document.getElementById("f-estado").value;
  const pagado = document.getElementById("f-pagado").value;
  const zona = document.getElementById("f-zona").value;
  if (estado) params.set("estado", estado);
  if (pagado) params.set("pagado", pagado);
  if (zona) params.set("zona_id", zona);
  return params.toString();
}

async function cargarZonas() {
  try {
    const res = await fetch("/api/zonas");
    if (!res.ok) return;
    const data = await res.json();
    const select = document.getElementById("f-zona");
    for (const z of data.zonas) {
      const opt = document.createElement("option");
      opt.value = z.id;
      opt.textContent = z.nombre + (z.activa ? "" : " (inactiva)");
      select.appendChild(opt);
    }
  } catch (err) {
    console.error("No se pudieron cargar las zonas:", err);
  }
}

function renderLista(pedidos) {
  const ul = document.getElementById("lista-pedidos");

  if (pedidos.length === 0) {
    ul.innerHTML = `<li class="estado-vacio">No hay pedidos con estos filtros.</li>`;
    return;
  }

  ul.innerHTML = pedidos
    .map(
      (p) => `
        <li class="fila-pedido ${p.id === pedidoSeleccionadoId ? "activa" : ""}" data-id="${p.id}">
          <div class="fila-top">
            <span class="numero">#${p.id}</span>
            <span class="fecha-chip">${fmtFecha(p.fecha_entrega)}</span>
          </div>
          <div class="cliente">${p.cliente.nombre} ${p.cliente.apellido}</div>
          <span class="badge ${p.pagado ? "pagado-si" : "pagado-no"}" style="margin-top:6px;">${p.pagado ? "Pagado" : "No pagado"}</span>
        </li>
      `
    )
    .join("");

  ul.querySelectorAll(".fila-pedido").forEach((li) => {
    li.addEventListener("click", () => seleccionarPedido(Number(li.dataset.id)));
  });
}

async function cargarLista() {
  const ul = document.getElementById("lista-pedidos");
  ul.innerHTML = `<li class="estado-cargando">Cargando…</li>`;
  try {
    const qs = construirQuery();
    // El backend ya ordena por fecha_entrega ASC (más cercana primero).
    const res = await fetch(`/api/pedidos${qs ? "?" + qs : ""}`);
    if (!res.ok) {
      ul.innerHTML = `<li class="estado-error">Error cargando pedidos</li>`;
      return;
    }
    const data = await res.json();
    renderLista(data.pedidos);
  } catch (err) {
    ul.innerHTML = `<li class="estado-error">Error de conexión: ${err.message}</li>`;
  }
}

function seleccionarPedido(id) {
  pedidoSeleccionadoId = id;
  document.querySelectorAll(".fila-pedido").forEach((li) => {
    li.classList.toggle("activa", Number(li.dataset.id) === id);
  });
  cargarDetalle(id);
}

// ===================== DETALLE (columna derecha) =====================

function metaArchivo(a) {
  return [a.rango ? `pág. ${a.rango}` : `${a.paginas} pág.`, `${a.copias} copia(s)`, a.faz, a.acabado]
    .filter(Boolean)
    .join(" · ");
}

function urlArchivo(pedidoId, r2Key) {
  return `/api/pedidos/${pedidoId}/archivo?key=${encodeURIComponent(r2Key)}`;
}

function renderArchivoCard(pedidoId, archivo, index) {
  if (archivo.error_confirmacion || !archivo.r2_key) {
    return `
      <div class="archivo-card">
        <div class="thumb-wrap"><span class="thumb-placeholder">⚠ sin archivo</span></div>
        <div class="info">
          <div class="nombre">${archivo.nombre || "(sin nombre)"}</div>
          <div class="archivo-error">${archivo.error_confirmacion || "No tiene r2_key válido"}</div>
        </div>
      </div>
    `;
  }

  const precio = archivo.precio
    ? `${fmtMoneda(archivo.precio.total)} <span style="color:var(--gris-texto);">(${archivo.precio.producto_secundario || "sin acabado"})</span>`
    : "";

  return `
    <div class="archivo-card" data-thumb-index="${index}">
      <div class="thumb-wrap" id="thumb-${index}"><span class="thumb-placeholder">cargando…</span></div>
      <div class="info">
        <div class="nombre">${archivo.nombre}</div>
        <div class="config">${metaArchivo(archivo)}</div>
        ${precio ? `<div class="precio">${precio}</div>` : ""}
        <button class="btn-abrir" data-url="${urlArchivo(pedidoId, archivo.r2_key)}">Abrir</button>
      </div>
    </div>
  `;
}

async function generarThumbnail(index, archivo, pedidoId) {
  const contenedor = document.getElementById(`thumb-${index}`);
  if (!contenedor || !archivo.r2_key) return;

  const ext = extension(archivo.nombre);
  const url = urlArchivo(pedidoId, archivo.r2_key);

  if (EXT_IMAGEN.includes(ext)) {
    const img = document.createElement("img");
    img.src = url;
    img.alt = archivo.nombre;
    img.onerror = () => {
      contenedor.innerHTML = `<span class="thumb-placeholder">no se pudo cargar</span>`;
    };
    contenedor.innerHTML = "";
    contenedor.appendChild(img);
    return;
  }

  if (ext === "pdf") {
    if (!window.pdfjsLib) {
      contenedor.innerHTML = `<span class="thumb-placeholder">PDF</span>`;
      return;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("no se pudo leer el archivo");
      const buffer = await res.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      const page = await pdf.getPage(1);
      const viewportBase = page.getViewport({ scale: 1 });
      const scale = 190 / viewportBase.width;
      const viewport = page.getViewport({ scale });

      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;

      contenedor.innerHTML = "";
      contenedor.appendChild(canvas);
    } catch (err) {
      contenedor.innerHTML = `<span class="thumb-placeholder">sin vista previa</span>`;
      console.error(`Miniatura de "${archivo.nombre}" falló:`, err);
    }
    return;
  }

  contenedor.innerHTML = `<span class="thumb-placeholder">${ext.toUpperCase() || "archivo"}</span>`;
}

function abrirTodos(pedido) {
  const validos = pedido.archivos.filter((a) => a.r2_key && !a.error_confirmacion);
  if (validos.length === 0) {
    mostrarToast("No hay archivos válidos para abrir", true);
    return;
  }
  validos.forEach((a) => window.open(urlArchivo(pedido.id, a.r2_key), "_blank"));
}

function render(pedido) {
  const detalle = document.getElementById("detalle");
  const turno = pedido.turno
    ? `${DIA_LABEL[pedido.turno.dia_semana]} ${pedido.turno.hora_inicio}–${pedido.turno.hora_fin}`
    : "—";

  const opcionesEstado = Object.entries(ESTADO_LABEL)
    .map(([valor, label]) => `<option value="${valor}" ${valor === pedido.estado ? "selected" : ""}>${label}</option>`)
    .join("");

  const alertaConfig = pedido.configuracion_corrupta
    ? `<div class="archivo-error" style="margin-bottom:14px;">⚠ No se pudo leer la configuración de este pedido (JSON corrupto). Revisar a mano.</div>`
    : "";

  detalle.innerHTML = `
    ${alertaConfig}
    <div class="detalle-header">
      <div>
        <h1>Pedido #${pedido.id}</h1>
        <p class="subtitulo">Creado ${fmtFechaHora(pedido.creado_en)} · actualizado ${fmtFechaHora(pedido.actualizado_en)}</p>
      </div>
      <div class="estado-form">
        <select id="select-estado">${opcionesEstado}</select>
        <button class="primary" id="btn-guardar-estado">Guardar</button>
      </div>
    </div>

    <div class="grid-cards">
      <div class="card">
        <h2>Cliente</h2>
        <dl>
          <dt>Nombre</dt><dd>${pedido.cliente.nombre} ${pedido.cliente.apellido}</dd>
          <dt>Documento</dt><dd>${pedido.cliente.documento}</dd>
          <dt>Email</dt><dd>${pedido.cliente.email || "—"}</dd>
          <dt>Celular</dt><dd>${pedido.cliente.celular || "—"}</dd>
        </dl>
      </div>
      <div class="card">
        <h2>Entrega</h2>
        <dl>
          <dt>Dirección</dt><dd>${pedido.direccion_entrega || "—"}</dd>
          <dt>Zona</dt><dd>${pedido.zona ? pedido.zona.nombre : "—"}</dd>
          <dt>Turno</dt><dd>${turno}</dd>
          <dt>Fecha de entrega</dt><dd>${pedido.fecha_entrega || "—"}</dd>
        </dl>
      </div>
      <div class="card">
        <h2>Pago</h2>
        <p style="margin:0 0 8px 0;"><span class="badge ${pedido.pagado ? "pagado-si" : "pagado-no"}">${pedido.pagado ? "Pagado" : "No pagado"}</span></p>
        <dl><dt>Total</dt><dd>${fmtMoneda(pedido.total)}</dd></dl>
      </div>
    </div>

    ${pedido.observaciones ? `<div class="seccion"><h2>Observaciones</h2><p>${pedido.observaciones}</p></div>` : ""}

    <div class="seccion">
      <div class="seccion-archivos-header">
        <h2 style="margin:0;">Archivos (${pedido.archivos.length})</h2>
        <button id="btn-abrir-todos">Abrir todos en pestañas nuevas</button>
      </div>
      <div class="grid-archivos">
        ${pedido.archivos.map((a, i) => renderArchivoCard(pedido.id, a, i)).join("")}
      </div>
    </div>
  `;

  document.getElementById("btn-guardar-estado").addEventListener("click", () => guardarEstado(pedido.id));
  document.getElementById("btn-abrir-todos").addEventListener("click", () => abrirTodos(pedido));

  detalle.querySelectorAll(".btn-abrir").forEach((btn) => {
    btn.addEventListener("click", () => window.open(btn.dataset.url, "_blank"));
  });

  // Miniaturas: se generan después de pintar el HTML, en paralelo, sin
  // bloquear el resto de la vista.
  pedido.archivos.forEach((a, i) => generarThumbnail(i, a, pedido.id));
}

async function cargarDetalle(id) {
  const detalle = document.getElementById("detalle");
  detalle.innerHTML = `<div class="estado-cargando">Cargando pedido #${id}…</div>`;
  try {
    const res = await fetch(`/api/pedidos/${id}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      detalle.innerHTML = `<div class="estado-error">Error cargando el pedido: ${err.error || res.status}</div>`;
      return;
    }
    const data = await res.json();
    render(data.pedido || data); // por si el endpoint devuelve el objeto plano
  } catch (err) {
    detalle.innerHTML = `<div class="estado-error">Error de conexión: ${err.message}</div>`;
  }
}

async function guardarEstado(id) {
  const select = document.getElementById("select-estado");
  const boton = document.getElementById("btn-guardar-estado");
  const nuevoEstado = select.value;

  boton.disabled = true;
  boton.textContent = "Guardando…";

  try {
    const res = await fetch(`/api/pedidos/${id}`, {
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
    await cargarDetalle(id);
    await cargarLista(); // por si hay un filtro de estado activo
  } catch (err) {
    mostrarToast("Error de conexión: " + err.message, true);
  } finally {
    boton.disabled = false;
    boton.textContent = "Guardar";
  }
}

// ===================== Arranque =====================

(async () => {
  /* await window.panelAuth.requireAuth();

  const user = await window.panelAuth.getUser();
  if (user) document.getElementById("user-email").textContent = user.email || "";
  document.getElementById("btn-logout").addEventListener("click", () => window.panelAuth.logout());
*/
  ["f-estado", "f-pagado", "f-zona"].forEach((id) => {
    document.getElementById(id).addEventListener("change", cargarLista);
  });
  document.getElementById("btn-limpiar").addEventListener("click", () => {
    document.getElementById("f-estado").value = "";
    document.getElementById("f-pagado").value = "";
    document.getElementById("f-zona").value = "";
    cargarLista();
  });

  await cargarZonas();
  await cargarLista();
})();
