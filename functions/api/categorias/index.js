import { json, errorJson, readJson } from '../lib/utils.js';

// GET /api/categorias -> incluye activas e inactivas (a diferencia de un
// eventual endpoint público, que solo mostraría las activas)
export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, codigo, nombre, activa FROM categorias ORDER BY nombre`
    ).all();
    return json({ categorias: results });
  } catch (e) {
    return errorJson(`Error consultando categorías: ${e.message}`, 500);
  }
}

// POST /api/categorias  body: { codigo, nombre, activa? }
// `codigo` es el slug estable que usa el frontend de cada proyecto/wizard
// (constante CATEGORIA en su app.js) — una vez creado no se edita más
// (ver [id].js), porque es lo que referencian productos.categoria_id,
// trabajos.categoria_id y reglas_produccion.categoria_id vía id, pero el
// código en sí es la referencia externa estable hacia esos proyectos.
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body || !body.codigo || !body.nombre) {
    return errorJson('Faltan campos requeridos: codigo, nombre', 400);
  }
  const codigo = String(body.codigo).trim();
  if (!/^[a-z0-9-]+$/.test(codigo)) {
    return errorJson('codigo debe ser un slug: solo minúsculas, números y guiones', 400);
  }
  const activa = body.activa === false ? 0 : 1;

  try {
    const res = await env.DB.prepare(
      `INSERT INTO categorias (codigo, nombre, activa) VALUES (?, ?, ?)`
    )
      .bind(codigo, body.nombre, activa)
      .run();
    return json({ ok: true, id: res.meta.last_row_id }, 201);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return errorJson('Ya existe una categoría con ese código', 409);
    }
    return errorJson(`Error creando la categoría: ${e.message}`, 500);
  }
}
