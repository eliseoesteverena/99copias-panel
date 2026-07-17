import { json, errorJson, readJson } from '../lib/utils.js';

// PUT /api/turnos/:id
export async function onRequestPut({ params, request, env }) {
  const id = params.id;
  const body = await readJson(request);
  if (!body) return errorJson('Body inválido', 400);

  const actual = await env.DB.prepare('SELECT * FROM turnos_entrega WHERE id = ?')
    .bind(id)
    .first();
  if (!actual) return errorJson('Turno no encontrado', 404);

  const dia = body.dia_semana === undefined ? actual.dia_semana : Number(body.dia_semana);
  if (!Number.isInteger(dia) || dia < 0 || dia > 6) {
    return errorJson('dia_semana debe ser un entero entre 0 (domingo) y 6 (sábado)', 400);
  }

  try {
    const capacidad =
      body.capacidad_maxima === undefined
        ? actual.capacidad_maxima
        : body.capacidad_maxima === ''
          ? null
          : Number(body.capacidad_maxima);

    await env.DB.prepare(
      `UPDATE turnos_entrega
       SET zona_id = ?, dia_semana = ?, hora_inicio = ?, hora_fin = ?,
           capacidad_maxima = ?, activo = ?
       WHERE id = ?`
    )
      .bind(
        body.zona_id ?? actual.zona_id,
        dia,
        body.hora_inicio ?? actual.hora_inicio,
        body.hora_fin ?? actual.hora_fin,
        capacidad,
        body.activo === undefined ? actual.activo : body.activo ? 1 : 0,
        id
      )
      .run();

    return json({ ok: true, id: Number(id) });
  } catch (e) {
    return errorJson(`Error actualizando el turno: ${e.message}`, 500);
  }
}

// DELETE /api/turnos/:id -> si tiene pedidos o excepciones asociadas, se
// desactiva en vez de borrarse.
export async function onRequestDelete({ params, env }) {
  const id = params.id;
  try {
    const actual = await env.DB.prepare('SELECT id FROM turnos_entrega WHERE id = ?')
      .bind(id)
      .first();
    if (!actual) return errorJson('Turno no encontrado', 404);

    const tienePedidos = await env.DB.prepare(
      'SELECT id FROM trabajos WHERE turno_entrega_id = ? LIMIT 1'
    )
      .bind(id)
      .first();
    const tieneExcepciones = await env.DB.prepare(
      'SELECT id FROM turnos_excepciones WHERE turno_entrega_id = ? LIMIT 1'
    )
      .bind(id)
      .first();

    if (tienePedidos || tieneExcepciones) {
      await env.DB.prepare('UPDATE turnos_entrega SET activo = 0 WHERE id = ?')
        .bind(id)
        .run();
      return json({
        ok: true,
        id: Number(id),
        accion: 'desactivado',
        motivo: 'El turno tiene pedidos y/o excepciones asociadas; se desactivó en vez de borrarlo.',
      });
    }

    await env.DB.prepare('DELETE FROM turnos_entrega WHERE id = ?').bind(id).run();
    return json({ ok: true, id: Number(id), accion: 'eliminado' });
  } catch (e) {
    return errorJson(`Error eliminando el turno: ${e.message}`, 500);
  }
}
