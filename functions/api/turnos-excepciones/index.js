import { json, errorJson, readJson } from '../lib/utils.js';

const TIPOS_VALIDOS = ['cancelado', 'capacidad_modificada', 'horario_modificado'];

// GET /api/turnos-excepciones?turno_entrega_id=
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const turnoId = url.searchParams.get('turno_entrega_id');

  let sql = `
    SELECT te.id, te.turno_entrega_id, te.fecha, te.tipo, te.capacidad_maxima,
           te.hora_inicio, te.hora_fin, te.motivo, te.creado_en,
           t.dia_semana, t.hora_inicio as turno_hora_inicio, t.hora_fin as turno_hora_fin,
           z.nombre as zona_nombre
    FROM turnos_excepciones te
    JOIN turnos_entrega t ON t.id = te.turno_entrega_id
    JOIN zonas z ON z.id = t.zona_id
  `;
  const params = [];
  if (turnoId) {
    sql += ' WHERE te.turno_entrega_id = ?';
    params.push(turnoId);
  }
  sql += ' ORDER BY te.fecha DESC';

  try {
    const { results } = await env.DB.prepare(sql).bind(...params).all();
    return json({ excepciones: results });
  } catch (e) {
    return errorJson(`Error consultando excepciones: ${e.message}`, 500);
  }
}

// POST /api/turnos-excepciones
// body: { turno_entrega_id, fecha, tipo, capacidad_maxima?, hora_inicio?, hora_fin?, motivo? }
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body || !body.turno_entrega_id || !body.fecha) {
    return errorJson('Faltan campos requeridos: turno_entrega_id, fecha', 400);
  }
  const tipo = body.tipo || 'cancelado';
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return errorJson(`tipo inválido. Debe ser: ${TIPOS_VALIDOS.join(', ')}`, 400);
  }
  if (tipo === 'capacidad_modificada' && body.capacidad_maxima === undefined) {
    return errorJson('capacidad_maxima es requerida para tipo capacidad_modificada', 400);
  }
  if (tipo === 'horario_modificado' && (!body.hora_inicio || !body.hora_fin)) {
    return errorJson('hora_inicio y hora_fin son requeridas para tipo horario_modificado', 400);
  }

  try {
    const turno = await env.DB.prepare('SELECT id FROM turnos_entrega WHERE id = ?')
      .bind(body.turno_entrega_id)
      .first();
    if (!turno) return errorJson('El turno indicado no existe', 404);

    const res = await env.DB.prepare(
      `INSERT INTO turnos_excepciones
        (turno_entrega_id, fecha, tipo, capacidad_maxima, hora_inicio, hora_fin, motivo)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        body.turno_entrega_id,
        body.fecha,
        tipo,
        body.capacidad_maxima ?? null,
        body.hora_inicio ?? null,
        body.hora_fin ?? null,
        body.motivo ?? null
      )
      .run();

    return json({ ok: true, id: res.meta.last_row_id }, 201);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return errorJson('Ya existe una excepción para ese turno en esa fecha', 409);
    }
    return errorJson(`Error creando la excepción: ${e.message}`, 500);
  }
}
