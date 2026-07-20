import { json, errorJson, readJson } from '../lib/utils.js';

// PUT /api/categorias/:id  body: { nombre?, activa? }
// El codigo NO se puede editar acá a propósito: es el slug estable que los
// wizards de cada categoría tienen hardcodeado y mandan en cada request
// (ver sección 5 del contexto del panel) — cambiarlo rompería esa referencia.
export async function onRequestPut({ params, request, env }) {
  const id = params.id;
  const body = await readJson(request);
  if (!body) return errorJson('Body inválido', 400);

  const actual = await env.DB.prepare('SELECT * FROM categorias WHERE id = ?')
    .bind(id)
    .first();
  if (!actual) return errorJson('Categoría no encontrada', 404);

  if (body.codigo !== undefined && body.codigo !== actual.codigo) {
    return errorJson('El código de una categoría no se puede editar una vez creada', 400);
  }

  try {
    await env.DB.prepare(`UPDATE categorias SET nombre = ?, activa = ? WHERE id = ?`)
      .bind(
        body.nombre ?? actual.nombre,
        body.activa === undefined ? actual.activa : body.activa ? 1 : 0,
        id
      )
      .run();
    return json({ ok: true, id: Number(id) });
  } catch (e) {
    return errorJson(`Error actualizando la categoría: ${e.message}`, 500);
  }
}

// DELETE /api/categorias/:id -> si tiene productos, reglas de producción o
// pedidos asociados, se desactiva en vez de borrarse.
export async function onRequestDelete({ params, env }) {
  const id = params.id;
  try {
    const actual = await env.DB.prepare('SELECT id FROM categorias WHERE id = ?')
      .bind(id)
      .first();
    if (!actual) return errorJson('Categoría no encontrada', 404);

    const tieneProductos = await env.DB.prepare(
      'SELECT id FROM productos WHERE categoria_id = ? LIMIT 1'
    )
      .bind(id)
      .first();
    const tieneReglas = await env.DB.prepare(
      'SELECT id FROM reglas_produccion WHERE categoria_id = ? LIMIT 1'
    )
      .bind(id)
      .first();
    const tienePedidos = await env.DB.prepare(
      'SELECT id FROM trabajos WHERE categoria_id = ? LIMIT 1'
    )
      .bind(id)
      .first();

    if (tieneProductos || tieneReglas || tienePedidos) {
      await env.DB.prepare('UPDATE categorias SET activa = 0 WHERE id = ?').bind(id).run();
      return json({
        ok: true,
        id: Number(id),
        accion: 'desactivada',
        motivo: 'La categoría tiene productos, reglas de producción y/o pedidos asociados; se desactivó en vez de borrarla.',
      });
    }

    await env.DB.prepare('DELETE FROM categorias WHERE id = ?').bind(id).run();
    return json({ ok: true, id: Number(id), accion: 'eliminada' });
  } catch (e) {
    return errorJson(`Error eliminando la categoría: ${e.message}`, 500);
  }
}
