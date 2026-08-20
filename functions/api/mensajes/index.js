import { json, errorJson, readJson } from '../lib/utils.js';

// GET /api/mensajes?trabajo_id=42
// Trae el hilo completo de un pedido y de paso marca como leídos por el
// operador los mensajes del cliente que todavía no se habían visto (así el
// contador de "sin leer" del listado de pedidos se actualiza solo al abrir
// el detalle, sin necesidad de un endpoint separado para marcar lectura).
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const trabajoId = url.searchParams.get('trabajo_id');
  if (!trabajoId) return errorJson('Falta el parámetro trabajo_id', 400);

  try {
    const { results } = await env.DB.prepare(
      `SELECT id, trabajo_id, autor, mensaje, leido_cliente, leido_operador, creado_en
       FROM mensajes_trabajo WHERE trabajo_id = ? ORDER BY creado_en ASC`
    )
      .bind(trabajoId)
      .all();

    await env.DB.prepare(
      `UPDATE mensajes_trabajo SET leido_operador = 1
       WHERE trabajo_id = ? AND autor = 'cliente' AND leido_operador = 0`
    )
      .bind(trabajoId)
      .run();

    return json({ mensajes: results });
  } catch (e) {
    return errorJson(`Error consultando mensajes: ${e.message}`, 500);
  }
}

// POST /api/mensajes   body: { trabajo_id, mensaje }
// El Panel escribe directo acá (misma D1, no pasa por ningún endpoint del
// wizard) — a diferencia de la revisión de comprobantes, la mensajería no
// tiene un efecto colateral sobre pagos/estado que justifique centralizar
// la escritura del lado del wizard.
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body || !body.trabajo_id || !body.mensaje || !body.mensaje.trim()) {
    return errorJson('Faltan campos requeridos: trabajo_id, mensaje', 400);
  }

  try {
    const trabajo = await env.DB.prepare('SELECT id FROM trabajos WHERE id = ?')
      .bind(body.trabajo_id)
      .first();
    if (!trabajo) return errorJson('El pedido indicado no existe', 404);

    const res = await env.DB.prepare(
      `INSERT INTO mensajes_trabajo (trabajo_id, autor, mensaje, leido_operador)
       VALUES (?, 'operador', ?, 1)`
    )
      .bind(body.trabajo_id, body.mensaje.trim())
      .run();

    return json({ ok: true, id: res.meta.last_row_id }, 201);
  } catch (e) {
    return errorJson(`Error enviando el mensaje: ${e.message}`, 500);
  }
}
