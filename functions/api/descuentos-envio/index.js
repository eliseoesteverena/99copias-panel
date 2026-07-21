import { json, errorJson, readJson } from '../lib/utils.js';

// GET /api/descuentos-envio?categoria_id=
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const categoriaId = url.searchParams.get('categoria_id');

  let sql = `
    SELECT d.id, d.categoria_id, d.carillas_desde, d.carillas_hasta,
           d.porcentaje_descuento, d.activa, c.nombre as categoria_nombre, c.codigo as categoria_codigo
    FROM descuentos_envio d
    JOIN categorias c ON c.id = d.categoria_id
  `;
  const params = [];
  if (categoriaId) {
    sql += ' WHERE d.categoria_id = ?';
    params.push(categoriaId);
  }
  sql += ' ORDER BY c.nombre, d.carillas_desde';

  try {
    const { results } = await env.DB.prepare(sql).bind(...params).all();
    return json({ descuentos: results });
  } catch (e) {
    return errorJson(`Error consultando descuentos de envío: ${e.message}`, 500);
  }
}

// POST /api/descuentos-envio
// body: { categoria_id, carillas_desde, carillas_hasta?, porcentaje_descuento, activa? }
// El % se aplica sobre zonas.precio_envio de la zona elegida en el pedido —
// el costo final ya congelado en trabajos.costo_envio, esto solo define la
// regla vigente para pedidos nuevos.
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (
    !body ||
    !body.categoria_id ||
    body.carillas_desde === undefined ||
    body.porcentaje_descuento === undefined
  ) {
    return errorJson(
      'Faltan campos requeridos: categoria_id, carillas_desde, porcentaje_descuento',
      400
    );
  }
  const carillasDesde = Number(body.carillas_desde);
  const carillasHasta =
    body.carillas_hasta === '' || body.carillas_hasta === undefined || body.carillas_hasta === null
      ? null
      : Number(body.carillas_hasta);
  const porcentaje = Number(body.porcentaje_descuento);

  if (!Number.isInteger(carillasDesde) || carillasDesde < 0) {
    return errorJson('carillas_desde debe ser un entero mayor o igual a 0', 400);
  }
  if (carillasHasta !== null && (!Number.isInteger(carillasHasta) || carillasHasta < carillasDesde)) {
    return errorJson('carillas_hasta debe ser un entero mayor o igual a carillas_desde (o vacío = sin techo)', 400);
  }
  if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
    return errorJson('porcentaje_descuento debe estar entre 0 y 100', 400);
  }

  try {
    const categoria = await env.DB.prepare('SELECT id FROM categorias WHERE id = ?')
      .bind(body.categoria_id)
      .first();
    if (!categoria) return errorJson('La categoría indicada no existe', 404);

    const activa = body.activa === false ? 0 : 1;
    const res = await env.DB.prepare(
      `INSERT INTO descuentos_envio (categoria_id, carillas_desde, carillas_hasta, porcentaje_descuento, activa)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(body.categoria_id, carillasDesde, carillasHasta, porcentaje, activa)
      .run();

    return json({ ok: true, id: res.meta.last_row_id }, 201);
  } catch (e) {
    return errorJson(`Error creando el descuento de envío: ${e.message}`, 500);
  }
}
