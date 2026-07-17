import { json, errorJson, readJson } from '../lib/utils.js';

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, nombre, activa FROM zonas ORDER BY nombre`
    ).all();
    return json({ zonas: results });
  } catch (e) {
    return errorJson(`Error consultando zonas: ${e.message}`, 500);
  }
}

// POST /api/zonas  body: { nombre, activa? }
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body || !body.nombre) return errorJson('Falta el campo nombre', 400);
  const activa = body.activa === false ? 0 : 1;

  try {
    const res = await env.DB.prepare(
      `INSERT INTO zonas (nombre, activa) VALUES (?, ?)`
    )
      .bind(body.nombre, activa)
      .run();
    return json({ ok: true, id: res.meta.last_row_id }, 201);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return errorJson('Ya existe una zona con ese nombre', 409);
    }
    return errorJson(`Error creando la zona: ${e.message}`, 500);
  }
}
