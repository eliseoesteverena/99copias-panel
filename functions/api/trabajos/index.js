import { json, errorJson } from '../lib/utils.js';

// GET /api/trabajos?estado=&pagado=&zona_id=&categoria_id=&con_envio=&fecha_desde=&fecha_hasta=&q=
// Lista pedidos para el panel (vista tipo bandeja de email).
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const estado = url.searchParams.get('estado');
  const pagado = url.searchParams.get('pagado');
  const zonaId = url.searchParams.get('zona_id');
  const categoriaId = url.searchParams.get('categoria_id');
  const conEnvio = url.searchParams.get('con_envio');
  const fechaDesde = url.searchParams.get('fecha_desde');
  const fechaHasta = url.searchParams.get('fecha_hasta');
  const comprobantePendiente = url.searchParams.get('comprobante_pendiente');
  const q = url.searchParams.get('q'); // busca por nombre/apellido/documento

  const condiciones = [];
  const params = [];

  if (estado) {
    condiciones.push('t.estado = ?');
    params.push(estado);
  }
  if (pagado === '0' || pagado === '1') {
    condiciones.push('t.pagado = ?');
    params.push(Number(pagado));
  }
  if (zonaId) {
    condiciones.push('t.zona_id = ?');
    params.push(zonaId);
  }
  if (categoriaId) {
    condiciones.push('t.categoria_id = ?');
    params.push(categoriaId);
  }
  if (conEnvio === '0' || conEnvio === '1') {
    condiciones.push('t.con_envio = ?');
    params.push(Number(conEnvio));
  }
  if (fechaDesde) {
    condiciones.push('t.fecha_entrega >= ?');
    params.push(fechaDesde);
  }
  if (fechaHasta) {
    condiciones.push('t.fecha_entrega <= ?');
    params.push(fechaHasta);
  }
  if (comprobantePendiente === '1') {
    condiciones.push(
      `EXISTS (SELECT 1 FROM pagos p WHERE p.trabajo_id = t.id AND p.medio = 'transferencia' AND p.estado_revision = 'pendiente')`
    );
  }
  if (q) {
    condiciones.push(
      '(pf.nombre LIKE ? OR pf.apellido LIKE ? OR pf.documento_numero LIKE ?)'
    );
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const sql = `
    SELECT
      t.id, t.estado, t.total, t.direccion_entrega, t.fecha_entrega,
      t.pagado, t.observaciones, t.creado_en, t.actualizado_en,
      t.zona_id, t.turno_entrega_id, t.categoria_id, t.con_envio, t.costo_envio,
      t.configuracion,
      t.user_id,
      pf.nombre, pf.apellido, pf.documento_tipo, pf.documento_numero, pf.celular,
      COALESCE(pf.email_contacto, u.email) as email,
      u.isAnonymous as usuario_anonimo,
      z.nombre as zona_nombre, z.es_retiro,
      te.dia_semana, te.hora_inicio, te.hora_fin,
      cat.nombre as categoria_nombre,
      EXISTS (
        SELECT 1 FROM pagos p
        WHERE p.trabajo_id = t.id AND p.medio = 'transferencia' AND p.estado_revision = 'pendiente'
      ) as comprobante_pendiente,
      (
        SELECT COUNT(*) FROM mensajes_trabajo m
        WHERE m.trabajo_id = t.id AND m.autor = 'cliente' AND m.leido_operador = 0
      ) as mensajes_sin_leer
    FROM trabajos t
    LEFT JOIN user u ON u.id = t.user_id
    LEFT JOIN perfil_fiscal pf ON pf.user_id = t.user_id
    LEFT JOIN zonas z ON z.id = t.zona_id
    LEFT JOIN turnos_entrega te ON te.id = t.turno_entrega_id
    LEFT JOIN categorias cat ON cat.id = t.categoria_id
    ${where}
    ORDER BY t.creado_en DESC
    LIMIT 300
  `;

  try {
    const { results } = await env.DB.prepare(sql)
      .bind(...params)
      .all();

    // Contamos archivos por pedido a partir de la configuración, para que
    // la lista muestre un ícono/contador sin tener que abrir el detalle.
    const trabajos = results.map((t) => {
      let archivosCount = 0;
      let tieneError = false;
      try {
        const cfg = JSON.parse(t.configuracion || '{}');
        const archivos = cfg.archivos || [];
        archivosCount = archivos.length;
        tieneError = archivos.some((a) => a.error_confirmacion);
      } catch {
        // configuracion corrupta o vacía, seguimos sin romper el listado
      }
      const { configuracion, comprobante_pendiente, ...resto } = t;
      return {
        ...resto,
        archivos_count: archivosCount,
        tiene_error_archivos: tieneError,
        comprobante_pendiente: !!comprobante_pendiente,
      };
    });

    return json({ trabajos });
  } catch (e) {
    return errorJson(`Error consultando pedidos: ${e.message}`, 500);
  }
}
