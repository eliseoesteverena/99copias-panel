import { json, errorJson } from '../lib/utils.js';

// GET /api/pagos/pendientes
// Bandeja de comprobantes de transferencia esperando aprobación/rechazo.
export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT
        p.id as pago_id, p.trabajo_id, p.monto, p.moneda, p.comprobante_r2_key,
        p.creado_en as pago_creado_en,
        t.total, t.estado as trabajo_estado, t.categoria_id,
        pf.nombre, pf.apellido, pf.documento_tipo, pf.documento_numero,
        cat.nombre as categoria_nombre
      FROM pagos p
      JOIN trabajos t ON t.id = p.trabajo_id
      LEFT JOIN perfil_fiscal pf ON pf.user_id = t.user_id
      LEFT JOIN categorias cat ON cat.id = t.categoria_id
      WHERE p.medio = 'transferencia' AND p.estado_revision = 'pendiente'
      ORDER BY p.creado_en ASC`
    ).all();
    return json({ pendientes: results });
  } catch (e) {
    return errorJson(`Error consultando comprobantes pendientes: ${e.message}`, 500);
  }
}
