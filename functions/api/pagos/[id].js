import { errorJson, json, readJson } from '../lib/utils.js';
import { llamarWizard } from '../lib/wizard.js';

// PATCH /api/pagos/:id   body: { aprobado: true|false, motivo_rechazo?: string }
//
// A diferencia del resto de las Functions del panel, ACÁ el Panel no
// escribe pagos.estado_revision ni trabajos.pagado/estado directamente —
// eso lo hace el Wizard al recibir la llamada (mismo código paralelo al
// webhook de Mercado Pago, según el documento de contexto). El Panel solo
// dispara la decisión y devuelve lo que el Wizard responda. Si la llamada
// al Wizard falla, la aprobación/rechazo NO se aplicó — no hay ningún
// escritura local de "respaldo" que pueda quedar desincronizada.
export async function onRequestPatch({ params, request, env }) {
  const id = params.id;
  const body = await readJson(request);

  if (!body || typeof body.aprobado !== 'boolean') {
    return errorJson('Falta el campo aprobado (true|false)', 400);
  }
  if (body.aprobado === false && !body.motivo_rechazo) {
    return errorJson('motivo_rechazo es requerido al rechazar un comprobante', 400);
  }

  try {
    const pago = await env.DB.prepare(
      `SELECT id, trabajo_id, medio, estado_revision FROM pagos WHERE id = ?`
    )
      .bind(id)
      .first();

    if (!pago) return errorJson('Pago no encontrado', 404);
    if (pago.medio !== 'transferencia') {
      return errorJson('Este pago no es por transferencia, no tiene comprobante para revisar', 400);
    }
    if (pago.estado_revision !== 'pendiente') {
      return errorJson(
        `Este comprobante ya fue revisado (estado actual: ${pago.estado_revision || 'sin estado'})`,
        409
      );
    }

    const resultado = await llamarWizard(env, '/api/panel/comprobante-revisado', {
      trabajo_id: pago.trabajo_id,
      aprobado: body.aprobado,
      motivo_rechazo: body.aprobado ? undefined : body.motivo_rechazo,
    });

    if (!resultado.ok) {
      return errorJson(
        `No se pudo confirmar la revisión con el wizard: ${resultado.error}. El comprobante sigue pendiente, no se aplicó ningún cambio.`,
        502
      );
    }

    return json({ ok: true, trabajo_id: pago.trabajo_id, aprobado: body.aprobado });
  } catch (e) {
    return errorJson(`Error revisando el comprobante: ${e.message}`, 500);
  }
}
