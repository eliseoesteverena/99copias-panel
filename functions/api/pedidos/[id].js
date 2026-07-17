// functions/api/pedidos/[id].js
//
// GET   /api/pedidos/:id  -> { pedido: {...} } con cliente, entrega, y
//                            archivos ya cruzados con su precio
//                            (configuracion.archivos + configuracion.items
//                            matcheados por nombre, ver sección 4 del
//                            contexto).
// PATCH /api/pedidos/:id  -> { estado: "pendiente"|"en_proceso"|"listo"|"entregado" }
//
// Los links de archivo NO son URLs directas a R2 (privado) — se arman en el
// frontend apuntando a /api/pedidos/:id/archivo?key=..., que es la Function
// que realmente lee el bucket.

const ESTADOS_VALIDOS = ["pendiente", "en_proceso", "listo", "entregado"];

export async function onRequestGet(context) {
  const { env, params } = context;
  const id = Number(params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "id de pedido inválido" }, { status: 400 });
  }

  try {
    const row = await env.DB.prepare(
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

    if (!row) {
      return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    let configuracion = { archivos: [], items: [] };
    let configuracionCorrupta = false;
    try {
      configuracion = JSON.parse(row.configuracion || "{}");
    } catch {
      configuracionCorrupta = true;
      configuracion = { archivos: [], items: [] };
    }

    const archivosRaw = configuracion.archivos || [];
    const itemsRaw = configuracion.items || [];

    // Cruce por nombre de archivo: `items` trae el desglose de precio ya
    // calculado server-side al momento del pedido (ver sección 5, precio
    // congelado, nunca se recalcula acá).
    const archivos = archivosRaw.map((a) => {
      const item = itemsRaw.find((it) => it.nombre === a.nombre) || null;
      return {
        nombre: a.nombre,
        paginas: a.paginas,
        copias: a.copias,
        rango: a.rango,
        faz: a.faz,
        acabado: a.acabado,
        r2_key: a.r2_key || null,
        error_confirmacion: a.error_confirmacion || null,
        precio: item
          ? {
              subtotal_primario: item.subtotal_primario,
              producto_secundario: item.producto_secundario,
              subtotal_secundario: item.subtotal_secundario,
              total: item.total,
            }
          : null,
      };
    });

    const pedido = {
      id: row.id,
      estado: row.estado,
      total: row.total,
      pagado: !!row.pagado,
      direccion_entrega: row.direccion_entrega,
      fecha_entrega: row.fecha_entrega,
      observaciones: row.observaciones,
      creado_en: row.creado_en,
      actualizado_en: row.actualizado_en,
      configuracion_corrupta: configuracionCorrupta,
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
    };

    return Response.json({ pedido });
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

  if (!ESTADOS_VALIDOS.includes(body.estado)) {
    return Response.json(
      { error: `estado inválido, debe ser uno de: ${ESTADOS_VALIDOS.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const result = await env.DB.prepare(
      "UPDATE trabajos SET estado = ?, actualizado_en = datetime('now') WHERE id = ?"
    )
      .bind(body.estado, id)
      .run();

    if (result.meta.changes === 0) {
      return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    return Response.json({ ok: true, id, estado: body.estado });
  } catch (err) {
    return Response.json({ error: "Error actualizando el estado: " + err.message }, { status: 500 });
  }
}
