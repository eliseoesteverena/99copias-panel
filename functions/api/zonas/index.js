import { json, errorJson, readJson } from '../lib/utils.js';

export async function onRequestGet({ env }) {
  try {
    const { results } = await env.DB.prepare(
      `SELECT id, nombre, activa, precio_envio, es_retiro FROM zonas ORDER BY es_retiro DESC, nombre`
    ).all();
    return json({ zonas: results });
  } catch (e) {
    return errorJson(`Error consultando zonas: ${e.message}`, 500);
  }
}

// POST /api/zonas  body: { nombre, activa?, precio_envio?, es_retiro? }
// "Retiro en local" es una zona más (es_retiro = 1) — si se marca, se fuerza
// precio_envio a 0 sin importar lo que venga en el body (una zona de retiro
// no tiene costo de envío por definición).
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body || !body.nombre) return errorJson('Falta el campo nombre', 400);
  const activa = body.activa === false ? 0 : 1;
  const esRetiro = body.es_retiro ? 1 : 0;
  const precioEnvio = esRetiro ? 0 : Number(body.precio_envio) || 0;
  if (precioEnvio < 0) return errorJson('precio_envio debe ser mayor o igual a 0', 400);

  try {
    const res = await env.DB.prepare(
      `INSERT INTO zonas (nombre, activa, precio_envio, es_retiro) VALUES (?, ?, ?, ?)`
    )
      .bind(body.nombre, activa, precioEnvio, esRetiro)
      .run();
    return json({ ok: true, id: res.meta.last_row_id }, 201);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      return errorJson('Ya existe una zona con ese nombre', 409);
    }
    return errorJson(`Error creando la zona: ${e.message}`, 500);
  }
}
