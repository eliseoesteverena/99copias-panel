import { json, errorJson, readJson } from '../lib/utils.js';

const TIPOS_VALIDOS = ['cancelado', 'capacidad_modificada', 'horario_modificado'];

// PUT /api/turnos-excepciones/:id
export async function onRequestPut({ params, request, env }) {
  const id = params.id;
  const body = await readJson(request);
  if (!body) return errorJson('Body inválido', 400);

  const actual = await env.DB.prepare('SELECT * FROM turnos_excepciones WHERE id = ?')
    .bind(id)
    .first();
  if (!actual) return errorJson('Excepción no encontrada', 404);

  const tipo = body.tipo ?? actual.tipo;
  if (!TIPOS_VALIDOS.includes(tipo)) {
    return errorJson(`tipo inválido. Debe ser: ${TIPOS_VALIDOS.join(', ')}`, 400);
  }

  try {
    await env.DB.prepare(
      `UPDATE turnos_excepciones
       SET fecha = ?, tipo = ?, capacidad_maxima = ?, hora_inicio = ?, hora_fin = ?, motivo = ?
       WHERE id = ?`
    )
      .bind(
        body.fecha ?? actual.fecha,
        tipo,
        body.capacidad_maxima ?? actual.capacidad_maxima,
        body.hora_inicio ?? actual.hora_inicio,
        body.hora_fin ?? actual.hora_fin,
        body.motivo ?? actual.motivo,
        id
      )
      .run();

    return json({ ok: true, id: Number(id) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return errorJson('Ya existe una excepción para ese turno en esa fecha', 409);
    }
    return errorJson(`Error actualizando la excepción: ${e.message}`, 500);
  }
}

// DELETE /api/turnos-excepciones/:id -> acá sí se borra directo, es un dato
// puntual sin implicancias de historial (no rompe trazabilidad de pedidos).
export async function onRequestDelete({ params, env }) {
  const id = params.id;
  try {
    const actual = await env.DB.prepare('SELECT id FROM turnos_excepciones WHERE id = ?')
      .bind(id)
      .first();
    if (!actual) return errorJson('Excepción no encontrada', 404);

    await env.DB.prepare('DELETE FROM turnos_excepciones WHERE id = ?').bind(id).run();
    return json({ ok: true, id: Number(id), accion: 'eliminada' });
  } catch (e) {
    return errorJson(`Error eliminando la excepción: ${e.message}`, 500);
  }
}
