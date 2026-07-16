// public/js/pedidos.js

const ESTADO_LABEL = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  listo: "Listo",
  entregado: "Entregado",
};

const DIA_LABEL = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

function fmtMoneda(n) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS" }).format(n);
}

function fmtFecha(iso) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function construirQuery() {
  const params = new URLSearchParams();
  const estado = document.getElementById("f-estado").value;
  const pagado = document.getElementById("f-pagado").value;
  const zona = document.getElementById("f-zona").value;
  const fecha = document.getElementById("f-fecha").value;

  if (estado) params.set("estado", estado);
  if (pagado) params.set("pagado", pagado);
  if (zona) params.set("zona_id", zona);
  if (fecha) params.set("fecha_entrega", fecha);

  return params.toString();
}

async function cargarZonas() {
  try {
    const res = await window.panelAuth.apiFetch("/api/zonas");
    if (!res.ok) return; // el filtro de zona no es crítico, degradamos en silencio
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

function renderTabla(pedidos) {
  const contenido = document.getElementById("contenido");

  if (pedidos.length === 0) {
    contenido.innerHTML = `<div class="estado-vacio">No hay pedidos que coincidan con estos filtros.</div>`;
    return;
  }

  const filas = pedidos
    .map((p) => {
      const turno = p.turno
        ? `${DIA_LABEL[p.turno.dia_semana]} ${p.turno.hora_inicio}–${p.turno.hora_fin}`
        : "—";
      return `
        <tr data-id="${p.id}">
          <td>#${p.id}</td>
          <td>${p.cliente.nombre} ${p.cliente.apellido}<br><span style="color:var(--gris-texto); font-size:12px;">${p.cliente.documento}</span></td>
          <td><span class="badge ${p.estado}">${ESTADO_LABEL[p.estado]}</span></td>
          <td><span class="badge ${p.pagado ? "pagado-si" : "pagado-no"}">${p.pagado ? "Pagado" : "No pagado"}</span></td>
          <td>${fmtMoneda(p.total)}</td>
          <td>${p.zona ? p.zona.nombre : "—"}<br><span style="color:var(--gris-texto); font-size:12px;">${turno}</span></td>
          <td>${fmtFecha(p.fecha_entrega)}</td>
        </tr>
      `;
    })
    .join("");

  contenido.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Pedido</th>
          <th>Cliente</th>
          <th>Estado</th>
          <th>Pago</th>
          <th>Total</th>
          <th>Zona / turno</th>
          <th>Entrega</th>
        </tr>
      </thead>
      <tbody>${filas}</tbody>
    </table>
  `;

  // El detalle de pedido (sección 8, punto 3) se agrega en la próxima etapa.
  contenido.querySelectorAll("tbody tr").forEach((tr) => {
    tr.addEventListener("click", () => {
      window.location.href = `/pedido.html?id=${tr.dataset.id}`;
    });
  });
}

async function cargarPedidos() {
  const contenido = document.getElementById("contenido");
  contenido.innerHTML = `<div class="estado-cargando">Cargando pedidos…</div>`;

  try {
    const qs = construirQuery();
    const res = await window.panelAuth.apiFetch(`/api/pedidos${qs ? "?" + qs : ""}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      contenido.innerHTML = `<div class="estado-error">Error cargando pedidos: ${err.error || res.status}</div>`;
      return;
    }
    const data = await res.json();
    renderTabla(data.pedidos);
  } catch (err) {
    contenido.innerHTML = `<div class="estado-error">Error de conexión: ${err.message}</div>`;
  }
}

(async () => {
  await window.panelAuth.requireAuth();

  const user = await window.panelAuth.getUser();
  if (user) document.getElementById("user-email").textContent = user.email || "";

  document.getElementById("btn-logout").addEventListener("click", () => window.panelAuth.logout());

  ["f-estado", "f-pagado", "f-zona", "f-fecha"].forEach((id) => {
    document.getElementById(id).addEventListener("change", cargarPedidos);
  });

  document.getElementById("btn-limpiar").addEventListener("click", () => {
    document.getElementById("f-estado").value = "";
    document.getElementById("f-pagado").value = "";
    document.getElementById("f-zona").value = "";
    document.getElementById("f-fecha").value = "";
    cargarPedidos();
  });

  await cargarZonas();
  await cargarPedidos();
})();
