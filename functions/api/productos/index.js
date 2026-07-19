import { json, errorJson, readJson } from '../lib/utils.js';

const JERARQUIAS_VALIDAS = ['primario', 'secundario', 'terciario'];

// GET /api/productos?categoria_id= -> incluye habilitados y deshabilitados
// (a diferencia del endpoint público del wizard, que solo devuelve el
// catálogo habilitado utilizable por una categoría puntual)
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const categoriaId = url.searchParams.get('categoria_id');

  let sql = `
    SELECT p.id, p.codigo, p.descripcion, p.unidad_medida, p.precio, p.habilitado,
           p.jerarquia, p.paginas_minimas, p.categoria_id, p.creado_en,
           c.nombre as categoria_nombre, c.codigo as categoria_codigo
    FROM productos p
    LEFT JOIN categorias c ON c.id = p.categoria_id
  `;
  const params = [];
  if (categoriaId) {
    sql += ' WHERE p.categoria_id = ?';
    params.push(categoriaId);
  }
  sql += ' ORDER BY p.jerarquia, p.descripcion';

  try {
    const { results } = await env.DB.prepare(sql).bind(...params).all();
    return json({ productos: results });
  } catch (e) {
    return errorJson(`Error consultando productos: ${e.message}`, 500);
  }
}

// POST /api/productos
// body: { codigo, descripcion, unidad_medida, precio, jerarquia, categoria_id, paginas_minimas, habilitado }
// categoria_id: null/omitido = transversal (disponible para cualquier categoría).
// Un primario SÍ necesita categoria_id (pertenece a una categoría puntual).
// Nota: a diferencia de una versión anterior de esta regla, hoy puede haber
// más de un producto primario habilitado a la vez dentro de una misma
// categoría (ej. ByN y Color) — no se valida unicidad acá.
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body || !body.codigo || !body.descripcion || !body.unidad_medida) {
    return errorJson('Faltan campos requeridos: codigo, descripcion, unidad_medida', 400);
  }
  const codigo = String(body.codigo).trim();
  if (!/^[a-z0-9_-]+$/.test(codigo)) {
    return errorJson('codigo debe contener solo minúsculas, números, guiones y guiones bajos', 400);
  }
  const jerarquia = body.jerarquia || 'secundario';
  if (!JERARQUIAS_VALIDAS.includes(jerarquia)) {
    return errorJson(`jerarquia inválida. Debe ser: ${JERARQUIAS_VALIDAS.join(', ')}`, 400);
  }
  const categoriaId = body.categoria_id === '' || body.categoria_id === undefined ? null : Number(body.categoria_id);
  if (jerarquia === 'primario' && !categoriaId) {
    return errorJson('Un producto primario necesita una categoría (no puede ser transversal)', 400);
  }
  const paginasMinimas =
    body.paginas_minimas === '' || body.paginas_minimas === undefined || body.paginas_minimas === null
      ? null
      : Number(body.paginas_minimas);
  if (paginasMinimas !== null && (!Number.isInteger(paginasMinimas) || paginasMinimas < 0)) {
    return errorJson('paginas_minimas debe ser un entero mayor o igual a 0 (o vacío = sin mínimo)', 400);
  }
  const precio = Number(body.precio) || 0;
  const habilitado = body.habilitado === false ? 0 : 1;

  try {
    if (categoriaId) {
      const categoria = await env.DB.prepare('SELECT id FROM categorias WHERE id = ?')
        .bind(categoriaId)
        .first();
      if (!categoria) return errorJson('La categoría indicada no existe', 404);
    }

    const res = await env.DB.prepare(
      `INSERT INTO productos
        (codigo, descripcion, unidad_medida, precio, habilitado, jerarquia, categoria_id, paginas_minimas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(codigo, body.descripcion, body.unidad_medida, precio, habilitado, jerarquia, categoriaId, paginasMinimas)
      .run();

    return json({ ok: true, id: res.meta.last_row_id }, 201);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return errorJson('Ya existe un producto con ese código', 409);
    }
    return errorJson(`Error creando el producto: ${e.message}`, 500);
  }
}
