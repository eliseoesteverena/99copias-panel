// functions/api/pedidos/[id].js
//
// GET   /api/pedidos/:id  → detalle completo (cliente, entrega, archivos,
//                            desglose de items, último pago conocido)
// PATCH /api/pedidos/:id  → cambia trabajos.estado
//                            body: { "estado": "en_proceso" | "listo" | "entregado" | "pendiente" }
//
// El detalle de archivos/items sale de trabajos.configuracion (JSON como
// texto, ver sección 4 del documento de contexto). Los links de descarga NO
// son URLs directas a R2 (el bucket es privado) — apuntan a
// /api/pedidos/:id/archivo?key=..., que sirve el archivo vía el binding.

const ESTADOS_VALIDOS = ["pendiente", "en_proceso", "listo", "entregado"];

async function cargarPedidoBase(env, id) {
  return env.DB.prepare(
    `
    SELECT
      t.id, t.estado, t.total, t.pagado, t.direccion_entrega, t.fecha_entrega,
      t.observaciones, t.configuracion, t.creado_en, t.actualizado_en,
      c.id AS cliente_id, c.nombre, c.apellido, c.documento_tipo, c.documento_numero,
      c.email, c.celular, c.direccion AS cliente_direccion,
      z.id AS zona_id, z.nombre AS zona_nombre,
      te.id AS turno_id, te.dia_semana, te.hora_inicio, te.hora_fin
    FROM trabajos t
    JOIN clientes c        ON c.id = t.cliente_id
    LEFT JOIN zonas z            ON z.id = t.zona_id
    LEFT JOIN turnos_entrega te  ON te.id = t.turno_entrega_id
    WHERE t.id = ?
    `
  )
    .bind(id)
    .first();
}

export async function onRequestGet(context) {
  const { env, params } = context;
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "id de pedido inválido" }, { status: 400 });
  }

  try {
    const row = await cargarPedidoBase(env, id);
    if (!row) {
      return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    let configuracion = { archivos: [], items: [] };
    try {
      configuracion = JSON.parse(row.configuracion || "{}");
    } catch {
      // Si el JSON viene corrupto no reventamos el detalle entero, avisamos.
      configuracion = { archivos: [], items: [], error_configuracion: "No se pudo parsear configuracion" };
    }

    const archivos = (configuracion.archivos || []).map((a) => ({
      ...a,
      // Solo tiene sentido el link de descarga si hay un r2_key válido.
      descarga_url: a.r2_key ? `/api/pedidos/${id}/archivo?key=${encodeURIComponent(a.r2_key)}` : null,
    }));

    const ultimoPago = await env.DB.prepare(
      `SELECT mp_payment_id, mp_status, mp_status_detail, mp_payment_type, monto, moneda, creado_en
       FROM pagos WHERE trabajo_id = ? ORDER BY creado_en DESC LIMIT 1`
    )
      .bind(id)
      .first();

    return Response.json({
      id: row.id,
      estado: row.estado,
      total: row.total,
      pagado: !!row.pagado,
      direccion_entrega: row.direccion_entrega,
      fecha_entrega: row.fecha_entrega,
      observaciones: row.observaciones,
      creado_en: row.creado_en,
      actualizado_en: row.actualizado_en,
      cliente: {
        id: row.cliente_id,
        nombre: row.nombre,
        apellido: row.apellido,
        documento: `${row.documento_tipo.toUpperCase()} ${row.documento_numero}`,
        email: row.email,
        celular: row.celular,
        direccion: row.cliente_direccion,
      },
      zona: row.zona_id ? { id: row.zona_id, nombre: row.zona_nombre } : null,
      turno: row.turno_id
        ? { id: row.turno_id, dia_semana: row.dia_semana, hora_inicio: row.hora_inicio, hora_fin: row.hora_fin }
        : null,
      archivos,
      items: configuracion.items || [],
      pago: ultimoPago || null,
    });
  } catch (err) {
    return Response.json({ error: "Error consultando el pedido: " + err.message }, { status: 500 });
  }
}

export async function onRequestPatch(context) {
  const { env, params, request } = context;
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "id de pedido inválido" }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body inválido, se espera JSON" }, { status: 400 });
  }

  const { estado } = body;
  if (!ESTADOS_VALIDOS.includes(estado)) {
    return Response.json({ error: `estado inválido, debe ser uno de: ${ESTADOS_VALIDOS.join(", ")}` }, { status: 400 });
  }

  try {
    const existente = await env.DB.prepare("SELECT id FROM trabajos WHERE id = ?").bind(id).first();
    if (!existente) {
      return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    await env.DB.prepare(
      "UPDATE trabajos SET estado = ?, actualizado_en = datetime('now') WHERE id = ?"
    )
      .bind(estado, id)
      .run();

    return Response.json({ ok: true, id, estado });
  } catch (err) {
    return Response.json({ error: "Error actualizando el estado: " + err.message }, { status: 500 });
  }
}
