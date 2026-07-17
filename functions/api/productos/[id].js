import { json, errorJson, readJson } from '../lib/utils.js';

const JERARQUIAS_VALIDAS = ['primario', 'secundario', 'terciario'];

// PUT /api/productos/:id  body: { descripcion?, unidad_medida?, precio?, jerarquia?, habilitado? }
// Nota: editar precio acá NO reescribe pedidos ya creados (el total y los
// items de trabajos existentes quedan congelados como comprobante).
export async function onRequestPut({ params, request, env }) {
  const id = params.id;
  const body = await readJson(request);
  if (!body) return errorJson('Body inválido', 400);

  const actual = await env.DB.prepare('SELECT * FROM productos WHERE id = ?')
    .bind(id)
    .first();
  if (!actual) return errorJson('Producto no encontrado', 404);

  const jerarquia = body.jerarquia ?? actual.jerarquia;
  if (!JERARQUIAS_VALIDAS.includes(jerarquia)) {
    return errorJson(`jerarquia inválida. Debe ser: ${JERARQUIAS_VALIDAS.join(', ')}`, 400);
  }
  const habilitado =
    body.habilitado === undefined ? actual.habilitado : body.habilitado ? 1 : 0;

  try {
    // Si este producto va a quedar como primario habilitado, chequeamos que
    // no haya otro primario habilitado distinto de éste.
    if (jerarquia === 'primario' && habilitado === 1) {
      const otroPrimario = await env.DB.prepare(
        `SELECT id, descripcion FROM productos
         WHERE jerarquia = 'primario' AND habilitado = 1 AND id != ?`
      )
        .bind(id)
        .first();
      if (otroPrimario) {
        return errorJson(
          `Ya existe otro producto primario habilitado ("${otroPrimario.descripcion}"). ` +
            `Deshabilitalo o cambiale la jerarquía antes de habilitar este.`,
          409
        );
      }
    }

    await env.DB.prepare(
      `UPDATE productos
       SET descripcion = ?, unidad_medida = ?, precio = ?, jerarquia = ?, habilitado = ?
       WHERE id = ?`
    )
      .bind(
        body.descripcion ?? actual.descripcion,
        body.unidad_medida ?? actual.unidad_medida,
        body.precio !== undefined ? Number(body.precio) : actual.precio,
        jerarquia,
        habilitado,
        id
      )
      .run();

    return json({ ok: true, id: Number(id) });
  } catch (e) {
    return errorJson(`Error actualizando el producto: ${e.message}`, 500);
  }
}

// DELETE /api/productos/:id
// No borramos físicamente si el producto ya fue usado en algún pedido
// (rompería la trazabilidad de comprobantes viejos) — lo deshabilitamos.
export async function onRequestDelete({ params, env }) {
  const id = params.id;
  try {
    const actual = await env.DB.prepare('SELECT id FROM productos WHERE id = ?')
      .bind(id)
      .first();
    if (!actual) return errorJson('Producto no encontrado', 404);

    const usado = await env.DB.prepare(
      `SELECT id FROM trabajos WHERE configuracion LIKE ? LIMIT 1`
    )
      .bind(`%"producto_primario_id":${id}%`)
      .first();
    const usadoSecundario = await env.DB.prepare(
      `SELECT id FROM trabajos WHERE configuracion LIKE ? LIMIT 1`
    )
      .bind(`%"producto_secundario_id":${id}%`)
      .first();

    if (usado || usadoSecundario) {
      await env.DB.prepare('UPDATE productos SET habilitado = 0 WHERE id = ?')
        .bind(id)
        .run();
      return json({
        ok: true,
        id: Number(id),
        accion: 'deshabilitado',
        motivo: 'El producto ya fue usado en pedidos existentes; se deshabilitó en vez de borrarlo.',
      });
    }

    await env.DB.prepare('DELETE FROM productos WHERE id = ?').bind(id).run();
    return json({ ok: true, id: Number(id), accion: 'eliminado' });
  } catch (e) {
    return errorJson(`Error eliminando el producto: ${e.message}`, 500);
  }
}
