import { json, errorJson, readJson } from '../lib/utils.js';

const JERARQUIAS_VALIDAS = ['primario', 'secundario', 'terciario'];

// PUT /api/productos/:id
// body: { descripcion?, unidad_medida?, precio?, jerarquia?, categoria_id?, paginas_minimas?, habilitado? }
// `codigo` es inmutable una vez creado (ver nota en categorias/[id].js: el
// cálculo de precio matchea por código, nunca por descripción) — si viene
// en el body y difiere del actual, se rechaza.
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

  if (body.codigo !== undefined && body.codigo !== actual.codigo) {
    return errorJson('El código de un producto no se puede editar una vez creado', 400);
  }

  const jerarquia = body.jerarquia ?? actual.jerarquia;
  if (!JERARQUIAS_VALIDAS.includes(jerarquia)) {
    return errorJson(`jerarquia inválida. Debe ser: ${JERARQUIAS_VALIDAS.join(', ')}`, 400);
  }

  const categoriaId =
    body.categoria_id === undefined
      ? actual.categoria_id
      : body.categoria_id === '' || body.categoria_id === null
        ? null
        : Number(body.categoria_id);
  if (jerarquia === 'primario' && !categoriaId) {
    return errorJson('Un producto primario necesita una categoría (no puede ser transversal)', 400);
  }

  const paginasMinimas =
    body.paginas_minimas === undefined
      ? actual.paginas_minimas
      : body.paginas_minimas === '' || body.paginas_minimas === null
        ? null
        : Number(body.paginas_minimas);
  if (paginasMinimas !== null && (!Number.isInteger(paginasMinimas) || paginasMinimas < 0)) {
    return errorJson('paginas_minimas debe ser un entero mayor o igual a 0 (o vacío = sin mínimo)', 400);
  }

  const habilitado =
    body.habilitado === undefined ? actual.habilitado : body.habilitado ? 1 : 0;

  try {
    if (categoriaId) {
      const categoria = await env.DB.prepare('SELECT id FROM categorias WHERE id = ?')
        .bind(categoriaId)
        .first();
      if (!categoria) return errorJson('La categoría indicada no existe', 404);
    }

    await env.DB.prepare(
      `UPDATE productos
       SET descripcion = ?, unidad_medida = ?, precio = ?, jerarquia = ?,
           categoria_id = ?, paginas_minimas = ?, habilitado = ?
       WHERE id = ?`
    )
      .bind(
        body.descripcion ?? actual.descripcion,
        body.unidad_medida ?? actual.unidad_medida,
        body.precio !== undefined ? Number(body.precio) : actual.precio,
        jerarquia,
        categoriaId,
        paginasMinimas,
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
