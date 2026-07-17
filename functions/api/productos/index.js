import { json, errorJson, readJson } from '../lib/utils.js';

const JERARQUIAS_VALIDAS = ['primario', 'secundario', 'terciario'];

// GET /api/productos -> incluye habilitados y deshabilitados (a diferencia
// del endpoint público del wizard, que solo devuelve el catálogo habilitado)
export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, descripcion, unidad_medida, precio, habilitado, jerarquia, creado_en
       FROM productos ORDER BY jerarquia, descripcion`
    ).all();
    return json({ productos: results });
  } catch (e) {
    return errorJson(`Error consultando productos: ${e.message}`, 500);
  }
}

// POST /api/productos  body: { descripcion, unidad_medida, precio, jerarquia, habilitado }
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body || !body.descripcion || !body.unidad_medida) {
    return errorJson('Faltan campos requeridos: descripcion, unidad_medida', 400);
  }
  const jerarquia = body.jerarquia || 'secundario';
  if (!JERARQUIAS_VALIDAS.includes(jerarquia)) {
    return errorJson(`jerarquia inválida. Debe ser: ${JERARQUIAS_VALIDAS.join(', ')}`, 400);
  }
  const precio = Number(body.precio) || 0;
  const habilitado = body.habilitado === false ? 0 : 1;

  try {
    if (jerarquia === 'primario') {
      const yaExiste = await env.DB.prepare(
        `SELECT id, descripcion FROM productos WHERE jerarquia = 'primario' AND habilitado = 1`
      ).first();
      if (yaExiste) {
        return errorJson(
          `Ya existe un producto primario habilitado ("${yaExiste.descripcion}"). ` +
            `Solo puede haber uno a la vez según la lógica de cálculo de precio.`,
          409
        );
      }
    }

    const res = await env.DB.prepare(
      `INSERT INTO productos (descripcion, unidad_medida, precio, habilitado, jerarquia)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(body.descripcion, body.unidad_medida, precio, habilitado, jerarquia)
      .run();

    return json({ ok: true, id: res.meta.last_row_id }, 201);
  } catch (e) {
    return errorJson(`Error creando el producto: ${e.message}`, 500);
  }
}
