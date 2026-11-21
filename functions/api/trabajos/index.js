import { json, errorJson, readJson } from '../lib/utils.js';
import { llamarWizard } from '../lib/wizard.js';
import { verificarSesion } from '../lib/auth-panel.js';

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
      `(COALESCE(pf.nombre, t.cliente_nombre) LIKE ? OR COALESCE(pf.apellido, t.cliente_apellido) LIKE ?
        OR COALESCE(pf.documento_numero, t.cliente_documento_numero) LIKE ? OR COALESCE(pf.celular, t.cliente_celular) LIKE ?)`
    );
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const sql = `
    SELECT
      t.id, t.estado, t.total, t.direccion_entrega, t.fecha_entrega,
      t.pagado, t.observaciones, t.creado_en, t.actualizado_en,
      t.zona_id, t.turno_entrega_id, t.categoria_id, t.con_envio, t.costo_envio,
      t.configuracion,
      t.user_id,
      t.origen, t.medio_pago, t.creado_por,
      -- pedidos manuales sin cuenta: el contacto vive en t.cliente_* (ver migracion_pedidos_manuales.sql)
      COALESCE(pf.nombre, t.cliente_nombre) as nombre,
      COALESCE(pf.apellido, t.cliente_apellido) as apellido,
      COALESCE(pf.documento_tipo, t.cliente_documento_tipo) as documento_tipo,
      COALESCE(pf.documento_numero, t.cliente_documento_numero) as documento_numero,
      COALESCE(pf.celular, t.cliente_celular) as celular,
      COALESCE(pf.email_contacto, t.cliente_email, CASE WHEN u.isAnonymous = 1 THEN NULL ELSE u.email END) as email,
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
        // Los renglones "sin archivo" (pedidos manuales) no cuentan como archivos subidos.
        archivosCount = archivos.filter((a) => !a.sin_archivo).length;
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

// POST /api/trabajos  -> carga manual de un pedido (ej. los que entran por WhatsApp).
// Requiere sesión del Panel (ver lib/auth-panel.js). El alta real la hace el Wizard
// (POST /api/panel/crear-pedido) para usar la misma lógica de precios que la web.
// Contrato del body: ver functions/api/panel/crear-pedido.js del Wizard.
export async function onRequestPost({ request, env }) {
  const sesion = await verificarSesion(request, env);
  if (!sesion.ok) return errorJson(sesion.error, sesion.status);

  const body = await readJson(request);
  if (!body || typeof body !== 'object') return errorJson('Body inválido.', 400);

  // Quién carga el pedido sale SIEMPRE del token, nunca de lo que mande el navegador.
  const { creado_por: _ignorado, ...datos } = body;
  const resultado = await llamarWizard(env, '/api/panel/crear-pedido', { ...datos, creado_por: sesion.email });

  if (!resultado.ok) {
    console.error('[trabajos POST] El Wizard no pudo crear el pedido', resultado.status, resultado.error);
    return errorJson(resultado.error || 'No se pudo crear el pedido.', estadoParaCliente(resultado.status));
  }
  console.log('[trabajos POST] Pedido manual creado', { trabajo_id: resultado.data && resultado.data.trabajo_id, por: sesion.email });
  return json(resultado.data, 201);
}

// 400/404/409 del Wizard se muestran tal cual. Un 401/403 del Wizard es un problema de
// configuración entre servidores (secreto), no una sesión vencida del operador: se
// informa como 502 para que el front no lo confunda con "volvé a iniciar sesión".
function estadoParaCliente(status) {
  return status >= 400 && status < 500 && status !== 401 && status !== 403 ? status : 502;
}
