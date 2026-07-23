import { json, errorJson, readJson } from '../lib/utils.js';

// POST /api/push/subscribe
// body: el objeto PushSubscription.toJSON() del navegador:
//   { endpoint, keys: { p256dh, auth } }
// Se guarda por endpoint (una fila por dispositivo/navegador suscripto).
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body || !body.endpoint || !body.keys || !body.keys.p256dh || !body.keys.auth) {
    return errorJson('Suscripción inválida: faltan endpoint o keys.p256dh/auth', 400);
  }

  try {
    await env.DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, p256dh, auth)
       VALUES (?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth`
    )
      .bind(body.endpoint, body.keys.p256dh, body.keys.auth)
      .run();

    return json({ ok: true }, 201);
  } catch (e) {
    return errorJson(`Error guardando la suscripción: ${e.message}`, 500);
  }
}

// DELETE /api/push/subscribe?endpoint=...
// Se llama al desactivar notificaciones desde el botón del panel.
export async function onRequestDelete({ request, env }) {
  const url = new URL(request.url);
  const endpoint = url.searchParams.get('endpoint');
  if (!endpoint) return errorJson('Falta el parámetro endpoint', 400);

  try {
    await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).run();
    return json({ ok: true });
  } catch (e) {
    return errorJson(`Error eliminando la suscripción: ${e.message}`, 500);
  }
}
