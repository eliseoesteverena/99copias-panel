import { json, errorJson, readJson } from '../lib/utils.js';
import { validarProductoDeRegla } from '../lib/reglas-produccion.js';

// PUT /api/reglas-produccion/:id
export async function onRequestPut({ params, request, env }) {
  const id = params.id;
  const body = await readJson(request);
  if (!body) return errorJson('Body inválido', 400);

  const actual = await env.DB.prepare('SELECT * FROM reglas_produccion WHERE id = ?')
    .bind(id)
    .first();
  if (!actual) return errorJson('Regla no encontrada', 404);

  const carillasDesde =
    body.carillas_desde === undefined ? actual.carillas_desde : Number(body.carillas_desde);
  const carillasHasta =
    body.carillas_hasta === undefined
      ? actual.carillas_hasta
      : body.carillas_hasta === '' || body.carillas_hasta === null
        ? null
        : Number(body.carillas_hasta);
  const horasMinimas =
    body.horas_minimas === undefined ? actual.horas_minimas : Number(body.horas_minimas);
  // producto_id: undefined = no tocar; ''/null = pasa a ser regla de categoría.
  const productoId =
    body.producto_id === undefined
      ? actual.producto_id
      : body.producto_id === '' || body.producto_id === null
        ? null
        : Number(body.producto_id);
  const categoriaId = body.categoria_id ?? actual.categoria_id;

  if (!Number.isInteger(carillasDesde) || carillasDesde < 0) {
    return errorJson('carillas_desde debe ser un entero mayor o igual a 0', 400);
  }
  if (carillasHasta !== null && (!Number.isInteger(carillasHasta) || carillasHasta < carillasDesde)) {
    return errorJson('carillas_hasta debe ser un entero mayor o igual a carillas_desde (o vacío = sin techo)', 400);
  }
  if (!Number.isInteger(horasMinimas) || horasMinimas < 0) {
    return errorJson('horas_minimas debe ser un entero mayor o igual a 0', 400);
  }
  if (productoId !== null && !Number.isInteger(productoId)) {
    return errorJson('producto_id inválido', 400);
  }

  try {
    if (body.categoria_id && Number(body.categoria_id) !== actual.categoria_id) {
      const categoria = await env.DB.prepare('SELECT id FROM categorias WHERE id = ?')
        .bind(body.categoria_id)
        .first();
      if (!categoria) return errorJson('La categoría indicada no existe', 404);
    }

    // Se revalida siempre que haya producto: cambiar la categoría puede dejar un producto
    // que ya no corresponde.
    if (productoId !== null) {
      const errProducto = await validarProductoDeRegla(env.DB, productoId, categoriaId);
      if (errProducto) return errorJson(errProducto, 400);
    }

    await env.DB.prepare(
      `UPDATE reglas_produccion
       SET categoria_id = ?, producto_id = ?, carillas_desde = ?, carillas_hasta = ?, horas_minimas = ?, activa = ?
       WHERE id = ?`
    )
      .bind(
        categoriaId,
        productoId,
        carillasDesde,
        carillasHasta,
        horasMinimas,
        body.activa === undefined ? actual.activa : body.activa ? 1 : 0,
        id
      )
      .run();

    return json({ ok: true, id: Number(id) });
  } catch (e) {
    return errorJson(`Error actualizando la regla de producción: ${e.message}`, 500);
  }
}

// DELETE /api/reglas-produccion/:id -> borrado directo, no tiene
// implicancias de trazabilidad de pedidos (es solo una regla de timing).
export async function onRequestDelete({ params, env }) {
  const id = params.id;
  try {
    const actual = await env.DB.prepare('SELECT id FROM reglas_produccion WHERE id = ?')
      .bind(id)
      .first();
    if (!actual) return errorJson('Regla no encontrada', 404);

    await env.DB.prepare('DELETE FROM reglas_produccion WHERE id = ?').bind(id).run();
    return json({ ok: true, id: Number(id), accion: 'eliminada' });
  } catch (e) {
    return errorJson(`Error eliminando la regla de producción: ${e.message}`, 500);
  }
}
