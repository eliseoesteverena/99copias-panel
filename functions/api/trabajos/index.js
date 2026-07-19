import { json, errorJson } from '../lib/utils.js';

// GET /api/trabajos?estado=&pagado=&zona_id=&fecha_desde=&fecha_hasta=&q=
// Lista pedidos para el panel (vista tipo bandeja de email).
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const estado = url.searchParams.get('estado');
  const pagado = url.searchParams.get('pagado');
  const zonaId = url.searchParams.get('zona_id');
  const categoriaId = url.searchParams.get('categoria_id');
  const fechaDesde = url.searchParams.get('fecha_desde');
  const fechaHasta = url.searchParams.get('fecha_hasta');
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
  if (fechaDesde) {
    condiciones.push('t.fecha_entrega >= ?');
    params.push(fechaDesde);
  }
  if (fechaHasta) {
    condiciones.push('t.fecha_entrega <= ?');
    params.push(fechaHasta);
  }
  if (q) {
    condiciones.push(
      '(c.nombre LIKE ? OR c.apellido LIKE ? OR c.documento_numero LIKE ?)'
    );
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const sql = `
    SELECT
      t.id, t.estado, t.total, t.direccion_entrega, t.fecha_entrega,
      t.pagado, t.observaciones, t.creado_en, t.actualizado_en,
      t.zona_id, t.turno_entrega_id, t.categoria_id, t.configuracion,
      c.id as cliente_id, c.nombre, c.apellido, c.documento_tipo,
      c.documento_numero, c.email, c.celular,
      z.nombre as zona_nombre,
      te.dia_semana, te.hora_inicio, te.hora_fin,
      cat.nombre as categoria_nombre
    FROM trabajos t
    JOIN clientes c ON c.id = t.cliente_id
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
      const { configuracion, ...resto } = t;
      return { ...resto, archivos_count: archivosCount, tiene_error_archivos: tieneError };
    });

    return json({ trabajos });
  } catch (e) {
    return errorJson(`Error consultando pedidos: ${e.message}`, 500);
  }
}
