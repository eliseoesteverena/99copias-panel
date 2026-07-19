import { json, errorJson, readJson } from '../lib/utils.js';

// GET /api/reglas-produccion?categoria_id=
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const categoriaId = url.searchParams.get('categoria_id');

  let sql = `
    SELECT r.id, r.categoria_id, r.carillas_desde, r.carillas_hasta,
           r.horas_minimas, r.activa, c.nombre as categoria_nombre, c.codigo as categoria_codigo
    FROM reglas_produccion r
    JOIN categorias c ON c.id = r.categoria_id
  `;
  const params = [];
  if (categoriaId) {
    sql += ' WHERE r.categoria_id = ?';
    params.push(categoriaId);
  }
  sql += ' ORDER BY c.nombre, r.carillas_desde';

  try {
    const { results } = await env.DB.prepare(sql).bind(...params).all();
    return json({ reglas: results });
  } catch (e) {
    return errorJson(`Error consultando reglas de producción: ${e.message}`, 500);
  }
}

// POST /api/reglas-produccion
// body: { categoria_id, carillas_desde, carillas_hasta?, horas_minimas, activa? }
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body || !body.categoria_id || body.carillas_desde === undefined || body.horas_minimas === undefined) {
    return errorJson(
      'Faltan campos requeridos: categoria_id, carillas_desde, horas_minimas',
      400
    );
  }
  const carillasDesde = Number(body.carillas_desde);
  const carillasHasta =
    body.carillas_hasta === '' || body.carillas_hasta === undefined || body.carillas_hasta === null
      ? null
      : Number(body.carillas_hasta);
  const horasMinimas = Number(body.horas_minimas);

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
    const categoria = await env.DB.prepare('SELECT id FROM categorias WHERE id = ?')
      .bind(body.categoria_id)
      .first();
    if (!categoria) return errorJson('La categoría indicada no existe', 404);

    const activa = body.activa === false ? 0 : 1;
    const res = await env.DB.prepare(
      `INSERT INTO reglas_produccion (categoria_id, carillas_desde, carillas_hasta, horas_minimas, activa)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(body.categoria_id, carillasDesde, carillasHasta, horasMinimas, activa)
      .run();

    return json({ ok: true, id: res.meta.last_row_id }, 201);
  } catch (e) {
    return errorJson(`Error creando la regla de producción: ${e.message}`, 500);
  }
}
