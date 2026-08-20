import { json, errorJson, readJson } from '../lib/utils.js';
import { llamarWizard } from '../lib/wizard.js';

const ESTADOS_VALIDOS = ['pendiente', 'en_proceso', 'listo', 'entregado'];
const ESTADOS_QUE_AVISAN_AL_WIZARD = ['listo', 'entregado'];

// GET /api/trabajos/:id -> detalle completo del pedido
export async function onRequestGet({ params, env }) {
  const id = params.id;

  try {
    const trabajo = await env.DB.prepare(
      `SELECT
        t.id, t.estado, t.total, t.direccion_entrega, t.fecha_entrega,
        t.pagado, t.observaciones, t.creado_en, t.actualizado_en,
        t.configuracion, t.zona_id, t.turno_entrega_id, t.categoria_id,
        t.con_envio, t.costo_envio,
        t.user_id,
        pf.nombre, pf.apellido, pf.documento_tipo, pf.documento_numero, pf.celular,
        COALESCE(pf.email_contacto, u.email) as email,
        u.isAnonymous as usuario_anonimo,
        z.nombre as zona_nombre, z.es_retiro, z.precio_envio as zona_precio_envio_actual,
        te.dia_semana, te.hora_inicio, te.hora_fin,
        cat.nombre as categoria_nombre
      FROM trabajos t
      LEFT JOIN user u ON u.id = t.user_id
      LEFT JOIN perfil_fiscal pf ON pf.user_id = t.user_id
      LEFT JOIN zonas z ON z.id = t.zona_id
      LEFT JOIN turnos_entrega te ON te.id = t.turno_entrega_id
      LEFT JOIN categorias cat ON cat.id = t.categoria_id
      WHERE t.id = ?`
    )
      .bind(id)
      .first();

    if (!trabajo) return errorJson('Pedido no encontrado', 404);

    const pagos = await env.DB.prepare(
      `SELECT id, mp_preference_id, mp_payment_id, mp_status, mp_status_detail,
              mp_payment_type, monto, moneda, creado_en, actualizado_en,
              medio, estado_revision, comprobante_r2_key, motivo_rechazo, revisado_en
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
// Si el estado nuevo es 'listo' o 'entregado', además avisa al wizard para
// que le mande la notificación correspondiente al cliente
// (POST /api/panel/estado-actualizado). El UPDATE local ya se hizo antes de
// esa llamada — si el aviso al wizard falla, el estado del pedido queda
// igual guardado (no se revierte); solo se informa el fallo en la
// respuesta para que el operador sepa que el cliente puede no haberse
// enterado.
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

    const respuesta = { ok: true, id: Number(id), estado: body.estado };

    if (ESTADOS_QUE_AVISAN_AL_WIZARD.includes(body.estado)) {
      const resultado = await llamarWizard(env, '/api/panel/estado-actualizado', {
        trabajo_id: Number(id),
        estado: body.estado,
      });
      if (!resultado.ok) {
        respuesta.avisoWizard = false;
        respuesta.avisoWizardError = resultado.error;
      }
    }

    return json(respuesta);
  } catch (e) {
    return errorJson(`Error actualizando el estado: ${e.message}`, 500);
  }
}
