import { json, errorJson, readJson } from '../lib/utils.js';

// PUT /api/zonas/:id  body: { nombre?, activa?, precio_envio?, es_retiro? }
// Igual que en el alta: si es_retiro queda en true, precio_envio se fuerza a 0.
// Editar precio_envio acá NO recalcula pedidos ya creados — costo_envio queda
// congelado en cada trabajo al momento de crearse.
export async function onRequestPut({ params, request, env }) {
  const id = params.id;
  const body = await readJson(request);
  if (!body) return errorJson('Body inválido', 400);

  const actual = await env.DB.prepare('SELECT * FROM zonas WHERE id = ?')
    .bind(id)
    .first();
  if (!actual) return errorJson('Zona no encontrada', 404);

  const esRetiro = body.es_retiro === undefined ? !!actual.es_retiro : !!body.es_retiro;
  let precioEnvio = body.precio_envio === undefined ? actual.precio_envio : Number(body.precio_envio);
  if (esRetiro) precioEnvio = 0;
  if (precioEnvio < 0) return errorJson('precio_envio debe ser mayor o igual a 0', 400);

  try {
    await env.DB.prepare(
      `UPDATE zonas SET nombre = ?, activa = ?, precio_envio = ?, es_retiro = ? WHERE id = ?`
    )
      .bind(
        body.nombre ?? actual.nombre,
        body.activa === undefined ? actual.activa : body.activa ? 1 : 0,
        precioEnvio,
        esRetiro ? 1 : 0,
        id
      )
      .run();
    return json({ ok: true, id: Number(id) });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return errorJson('Ya existe una zona con ese nombre', 409);
    }
    return errorJson(`Error actualizando la zona: ${e.message}`, 500);
  }
}

// DELETE /api/zonas/:id -> si tiene turnos o pedidos asociados, se desactiva
// en vez de borrarse (para no romper foreign keys / historial).
export async function onRequestDelete({ params, env }) {
  const id = params.id;
  try {
    const actual = await env.DB.prepare('SELECT id FROM zonas WHERE id = ?')
      .bind(id)
      .first();
    if (!actual) return errorJson('Zona no encontrada', 404);

    const tieneTurnos = await env.DB.prepare(
      'SELECT id FROM turnos_entrega WHERE zona_id = ? LIMIT 1'
    )
      .bind(id)
      .first();
    const tienePedidos = await env.DB.prepare(
      'SELECT id FROM trabajos WHERE zona_id = ? LIMIT 1'
    )
      .bind(id)
      .first();

    if (tieneTurnos || tienePedidos) {
      await env.DB.prepare('UPDATE zonas SET activa = 0 WHERE id = ?').bind(id).run();
      return json({
        ok: true,
        id: Number(id),
        accion: 'desactivada',
        motivo: 'La zona tiene turnos y/o pedidos asociados; se desactivó en vez de borrarla.',
      });
    }

    await env.DB.prepare('DELETE FROM zonas WHERE id = ?').bind(id).run();
    return json({ ok: true, id: Number(id), accion: 'eliminada' });
  } catch (e) {
    return errorJson(`Error eliminando la zona: ${e.message}`, 500);
  }
}
