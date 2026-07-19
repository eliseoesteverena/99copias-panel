import { json, errorJson, readJson } from '../lib/utils.js';

// PUT /api/reglas-produccion/:id
export async function onRequestPut({ params, request, env }) {
  const id = params.id;
  const body = await readJson(request);
  if (!body) return errorJson('Body inválido', 400);

  const actual = await env.DB.prepare('SELECT * FROM reglas_produccion WHERE id = ?')
    .bind(id)
    .first();
  if (!actual) return errorJson('Regla no encontrada', 404);

  const carillasDesde =
    body.carillas_desde === undefined ? actual.carillas_desde : Number(body.carillas_desde);
  const carillasHasta =
    body.carillas_hasta === undefined
      ? actual.carillas_hasta
      : body.carillas_hasta === '' || body.carillas_hasta === null
        ? null
        : Number(body.carillas_hasta);
  const horasMinimas =
    body.horas_minimas === undefined ? actual.horas_minimas : Number(body.horas_minimas);

  if (!Number.isInteger(carillasDesde) || carillasDesde < 0) {
    return errorJson('carillas_desde debe ser un entero mayor o igual a 0', 400);
  }
  if (carillasHasta !== null && (!Number.isInteger(carillasHasta) || carillasHasta < carillasDesde)) {
    return errorJson('carillas_hasta debe ser un entero mayor o igual a carillas_desde (o vacío = sin techo)', 400);
  }
  if (!Number.isInteger(horasMinimas) || horasMinimas < 0) {
    return errorJson('horas_minimas debe ser un entero mayor o igual a 0', 400);
  }

  try {
    if (body.categoria_id && Number(body.categoria_id) !== actual.categoria_id) {
      const categoria = await env.DB.prepare('SELECT id FROM categorias WHERE id = ?')
        .bind(body.categoria_id)
        .first();
      if (!categoria) return errorJson('La categoría indicada no existe', 404);
    }

    await env.DB.prepare(
      `UPDATE reglas_produccion
       SET categoria_id = ?, carillas_desde = ?, carillas_hasta = ?, horas_minimas = ?, activa = ?
       WHERE id = ?`
    )
      .bind(
        body.categoria_id ?? actual.categoria_id,
        carillasDesde,
        carillasHasta,
        horasMinimas,
        body.activa === undefined ? actual.activa : body.activa ? 1 : 0,
        id
      )
      .run();

    return json({ ok: true, id: Number(id) });
  } catch (e) {
    return errorJson(`Error actualizando la regla de producción: ${e.message}`, 500);
  }
}

// DELETE /api/reglas-produccion/:id -> borrado directo, no tiene
// implicancias de trazabilidad de pedidos (es solo una regla de timing).
export async function onRequestDelete({ params, env }) {
  const id = params.id;
  try {
    const actual = await env.DB.prepare('SELECT id FROM reglas_produccion WHERE id = ?')
      .bind(id)
      .first();
    if (!actual) return errorJson('Regla no encontrada', 404);

    await env.DB.prepare('DELETE FROM reglas_produccion WHERE id = ?').bind(id).run();
    return json({ ok: true, id: Number(id), accion: 'eliminada' });
  } catch (e) {
    return errorJson(`Error eliminando la regla de producción: ${e.message}`, 500);
  }
}
