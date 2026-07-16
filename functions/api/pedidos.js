// functions/api/pedidos.js
//
// GET /api/pedidos?estado=&fecha_entrega=&zona_id=&pagado=
//
// Lista pedidos (tabla `trabajos`) con datos de cliente/zona/turno ya
// resueltos, para no tener que hacer N+1 requests desde el frontend.
// El detalle completo (items, archivos) se resuelve aparte en
// GET /api/pedidos/:id (ver ese endpoint).

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const estado = url.searchParams.get("estado");
  const fechaEntrega = url.searchParams.get("fecha_entrega");
  const zonaId = url.searchParams.get("zona_id");
  const pagadoParam = url.searchParams.get("pagado"); // "0" | "1" | null

  const estadosValidos = ["pendiente", "en_proceso", "listo", "entregado"];
  if (estado && !estadosValidos.includes(estado)) {
    return Response.json({ error: `estado inválido, debe ser uno de: ${estadosValidos.join(", ")}` }, { status: 400 });
  }
  if (pagadoParam && !["0", "1"].includes(pagadoParam)) {
    return Response.json({ error: "pagado inválido, debe ser 0 o 1" }, { status: 400 });
  }
  if (zonaId && !/^\d+$/.test(zonaId)) {
    return Response.json({ error: "zona_id inválido" }, { status: 400 });
  }
  if (fechaEntrega && !/^\d{4}-\d{2}-\d{2}$/.test(fechaEntrega)) {
    return Response.json({ error: "fecha_entrega inválida, formato esperado YYYY-MM-DD" }, { status: 400 });
  }

  const conditions = [];
  const params = [];

  if (estado) {
    conditions.push("t.estado = ?");
    params.push(estado);
  }
  if (fechaEntrega) {
    conditions.push("t.fecha_entrega = ?");
    params.push(fechaEntrega);
  }
  if (zonaId) {
    conditions.push("t.zona_id = ?");
    params.push(Number(zonaId));
  }
  if (pagadoParam !== null && pagadoParam !== "") {
    conditions.push("t.pagado = ?");
    params.push(Number(pagadoParam));
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const query = `
    SELECT
      t.id,
      t.estado,
      t.total,
      t.pagado,
      t.direccion_entrega,
      t.fecha_entrega,
      t.observaciones,
      t.creado_en,
      c.id   AS cliente_id,
      c.nombre,
      c.apellido,
      c.documento_tipo,
      c.documento_numero,
      c.email,
      c.celular,
      z.id   AS zona_id,
      z.nombre AS zona_nombre,
      te.id  AS turno_id,
      te.dia_semana,
      te.hora_inicio,
      te.hora_fin
    FROM trabajos t
    JOIN clientes c        ON c.id = t.cliente_id
    LEFT JOIN zonas z            ON z.id = t.zona_id
    LEFT JOIN turnos_entrega te  ON te.id = t.turno_entrega_id
    ${whereClause}
    ORDER BY t.creado_en DESC
    LIMIT 200
  `;

  try {
    const stmt = env.DB.prepare(query).bind(...params);
    const { results } = await stmt.all();

    const pedidos = results.map((r) => ({
      id: r.id,
      estado: r.estado,
      total: r.total,
      pagado: !!r.pagado,
      direccion_entrega: r.direccion_entrega,
      fecha_entrega: r.fecha_entrega,
      observaciones: r.observaciones,
      creado_en: r.creado_en,
      cliente: {
        id: r.cliente_id,
        nombre: r.nombre,
        apellido: r.apellido,
        documento: `${r.documento_tipo.toUpperCase()} ${r.documento_numero}`,
        email: r.email,
        celular: r.celular,
      },
      zona: r.zona_id ? { id: r.zona_id, nombre: r.zona_nombre } : null,
      turno: r.turno_id
        ? { id: r.turno_id, dia_semana: r.dia_semana, hora_inicio: r.hora_inicio, hora_fin: r.hora_fin }
        : null,
    }));

    return Response.json({ pedidos, total: pedidos.length });
  } catch (err) {
    return Response.json({ error: "Error consultando pedidos: " + err.message }, { status: 500 });
  }
}
