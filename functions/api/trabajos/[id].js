import { json, errorJson, readJson } from '../lib/utils.js';

const ESTADOS_VALIDOS = ['pendiente', 'en_proceso', 'listo', 'entregado'];

// GET /api/trabajos/:id -> detalle completo del pedido
export async function onRequestGet({ params, env }) {
  const id = params.id;

  try {
    const trabajo = await env.DB.prepare(
      `SELECT
        t.id, t.estado, t.total, t.direccion_entrega, t.fecha_entrega,
        t.pagado, t.observaciones, t.creado_en, t.actualizado_en,
        t.configuracion, t.zona_id, t.turno_entrega_id,
        c.id as cliente_id, c.nombre, c.apellido, c.documento_tipo,
        c.documento_numero, c.email, c.celular, c.direccion as cliente_direccion,
        z.nombre as zona_nombre,
        te.dia_semana, te.hora_inicio, te.hora_fin
      FROM trabajos t
      JOIN clientes c ON c.id = t.cliente_id
      LEFT JOIN zonas z ON z.id = t.zona_id
      LEFT JOIN turnos_entrega te ON te.id = t.turno_entrega_id
      WHERE t.id = ?`
    )
      .bind(id)
      .first();

    if (!trabajo) return errorJson('Pedido no encontrado', 404);

    const pagos = await env.DB.prepare(
      `SELECT id, mp_preference_id, mp_payment_id, mp_status, mp_status_detail,
              mp_payment_type, monto, moneda, creado_en, actualizado_en
       FROM pagos WHERE trabajo_id = ? ORDER BY creado_en DESC`
    )
      .bind(id)
      .all();

    let configuracion = { archivos: [], items: [] };
    try {
      configuracion = JSON.parse(trabajo.configuracion || '{}');
    } catch {
      // dejamos configuracion vacía si viene corrupta, no rompemos la vista
    }

    const { configuracion: _omit, ...trabajoSinConfig } = trabajo;

    return json({
      trabajo: trabajoSinConfig,
      archivos: configuracion.archivos || [],
      items: configuracion.items || [],
      pagos: pagos.results || [],
    });
  } catch (e) {
    return errorJson(`Error consultando el pedido: ${e.message}`, 500);
  }
}

// PATCH /api/trabajos/:id  body: { estado } -> avanza el estado manualmente
export async function onRequestPatch({ params, request, env }) {
  const id = params.id;
  const body = await readJson(request);

  if (!body || !ESTADOS_VALIDOS.includes(body.estado)) {
    return errorJson(
      `Estado inválido. Debe ser uno de: ${ESTADOS_VALIDOS.join(', ')}`,
      400
    );
  }

  try {
    const existe = await env.DB.prepare('SELECT id FROM trabajos WHERE id = ?')
      .bind(id)
      .first();
    if (!existe) return errorJson('Pedido no encontrado', 404);

    await env.DB.prepare(
      `UPDATE trabajos SET estado = ?, actualizado_en = datetime('now') WHERE id = ?`
    )
      .bind(body.estado, id)
      .run();

    return json({ ok: true, id: Number(id), estado: body.estado });
  } catch (e) {
    return errorJson(`Error actualizando el estado: ${e.message}`, 500);
  }
}
