import { json, errorJson, readJson } from '../lib/utils.js';

// PUT /api/descuentos-envio/:id
export async function onRequestPut({ params, request, env }) {
  const id = params.id;
  const body = await readJson(request);
  if (!body) return errorJson('Body inválido', 400);

  const actual = await env.DB.prepare('SELECT * FROM descuentos_envio WHERE id = ?')
    .bind(id)
    .first();
  if (!actual) return errorJson('Descuento no encontrado', 404);

  const carillasDesde =
    body.carillas_desde === undefined ? actual.carillas_desde : Number(body.carillas_desde);
  const carillasHasta =
    body.carillas_hasta === undefined
      ? actual.carillas_hasta
      : body.carillas_hasta === '' || body.carillas_hasta === null
        ? null
        : Number(body.carillas_hasta);
  const porcentaje =
    body.porcentaje_descuento === undefined ? actual.porcentaje_descuento : Number(body.porcentaje_descuento);

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
    if (body.categoria_id && Number(body.categoria_id) !== actual.categoria_id) {
      const categoria = await env.DB.prepare('SELECT id FROM categorias WHERE id = ?')
        .bind(body.categoria_id)
        .first();
      if (!categoria) return errorJson('La categoría indicada no existe', 404);
    }

    await env.DB.prepare(
      `UPDATE descuentos_envio
       SET categoria_id = ?, carillas_desde = ?, carillas_hasta = ?, porcentaje_descuento = ?, activa = ?
       WHERE id = ?`
    )
      .bind(
        body.categoria_id ?? actual.categoria_id,
        carillasDesde,
        carillasHasta,
        porcentaje,
        body.activa === undefined ? actual.activa : body.activa ? 1 : 0,
        id
      )
      .run();

    return json({ ok: true, id: Number(id) });
  } catch (e) {
    return errorJson(`Error actualizando el descuento de envío: ${e.message}`, 500);
  }
}

// DELETE /api/descuentos-envio/:id -> borrado directo, no tiene implicancias
// de trazabilidad (el costo ya está congelado en cada trabajo.costo_envio).
export async function onRequestDelete({ params, env }) {
  const id = params.id;
  try {
    const actual = await env.DB.prepare('SELECT id FROM descuentos_envio WHERE id = ?')
      .bind(id)
      .first();
    if (!actual) return errorJson('Descuento no encontrado', 404);

    await env.DB.prepare('DELETE FROM descuentos_envio WHERE id = ?').bind(id).run();
    return json({ ok: true, id: Number(id), accion: 'eliminado' });
  } catch (e) {
    return errorJson(`Error eliminando el descuento de envío: ${e.message}`, 500);
  }
}
