import { json, errorJson, readJson } from '../lib/utils.js';

// GET /api/turnos?zona_id= -> turnos recurrentes (con nombre de zona resuelto)
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const zonaId = url.searchParams.get('zona_id');

  let sql = `
    SELECT te.id, te.zona_id, te.dia_semana, te.hora_inicio, te.hora_fin,
           te.capacidad_maxima, te.activo, z.nombre as zona_nombre
    FROM turnos_entrega te
    JOIN zonas z ON z.id = te.zona_id
  `;
  const params = [];
  if (zonaId) {
    sql += ' WHERE te.zona_id = ?';
    params.push(zonaId);
  }
  sql += ' ORDER BY z.nombre, te.dia_semana, te.hora_inicio';

  try {
    const { results } = await env.DB.prepare(sql).bind(...params).all();
    return json({ turnos: results });
  } catch (e) {
    return errorJson(`Error consultando turnos: ${e.message}`, 500);
  }
}

// POST /api/turnos  body: { zona_id, dia_semana, hora_inicio, hora_fin, capacidad_maxima?, activo? }
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (
    !body ||
    !body.zona_id ||
    body.dia_semana === undefined ||
    !body.hora_inicio ||
    !body.hora_fin
  ) {
    return errorJson(
      'Faltan campos requeridos: zona_id, dia_semana, hora_inicio, hora_fin',
      400
    );
  }
  const dia = Number(body.dia_semana);
  if (!Number.isInteger(dia) || dia < 0 || dia > 6) {
    return errorJson('dia_semana debe ser un entero entre 0 (domingo) y 6 (sábado)', 400);
  }

  try {
    const zona = await env.DB.prepare('SELECT id FROM zonas WHERE id = ?')
      .bind(body.zona_id)
      .first();
    if (!zona) return errorJson('La zona indicada no existe', 404);

    const activo = body.activo === false ? 0 : 1;
    const capacidad =
      body.capacidad_maxima === '' || body.capacidad_maxima === undefined
        ? null
        : Number(body.capacidad_maxima);

    const res = await env.DB.prepare(
      `INSERT INTO turnos_entrega
        (zona_id, dia_semana, hora_inicio, hora_fin, capacidad_maxima, activo)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(body.zona_id, dia, body.hora_inicio, body.hora_fin, capacidad, activo)
      .run();

    return json({ ok: true, id: res.meta.last_row_id }, 201);
  } catch (e) {
    return errorJson(`Error creando el turno: ${e.message}`, 500);
  }
}
