import { sendPushNotification } from '@mmmike/web-push';
import { json, errorJson, readJson } from '../lib/utils.js';

function fmtMoneda(n) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n || 0);
}

// POST /api/push/notificar-pedido
// body: { trabajo_id }
// header opcional (recomendado): x-webhook-secret — si env.WEBHOOK_SECRET
// está configurado, se exige que coincida. Esta es la única "puerta" de
// este endpoint: no hay login de usuario en el panel (a propósito, ver
// README), pero este endpoint sí conviene protegerlo con un secreto
// compartido porque es server-to-server (el wizard llamándolo), no una
// pantalla que use el staff.
//
// Solo necesita el trabajo_id — el resto de los datos (cliente, total,
// categoría) los busca acá mismo en D1, en vez de confiar en lo que mande
// el wizard, para tener una sola fuente de verdad.
export async function onRequestPost({ request, env }) {
  if (env.WEBHOOK_SECRET) {
    const recibido = request.headers.get('x-webhook-secret');
    if (recibido !== env.WEBHOOK_SECRET) {
      return errorJson('Webhook secret inválido o ausente', 401);
    }
  }

  const body = await readJson(request);
  if (!body || !body.trabajo_id) {
    return errorJson('Falta trabajo_id', 400);
  }

  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return errorJson(
      'Faltan configurar los secrets VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en este proyecto de Cloudflare Pages',
      500
    );
  }

  try {
    const trabajo = await env.DB.prepare(
      `SELECT t.id, t.total, t.con_envio,
              c.nombre, c.apellido,
              cat.nombre as categoria_nombre
       FROM trabajos t
       JOIN clientes c ON c.id = t.cliente_id
       LEFT JOIN categorias cat ON cat.id = t.categoria_id
       WHERE t.id = ?`
    )
      .bind(body.trabajo_id)
      .first();

    if (!trabajo) return errorJson('El pedido indicado no existe', 404);

    const { results: suscripciones } = await env.DB.prepare('SELECT * FROM push_subscriptions').all();

    if (suscripciones.length === 0) {
      return json({ ok: true, enviados: 0, fallidos: 0, motivo: 'No hay suscripciones activas' });
    }

    const vapid = {
      subject: env.VAPID_SUBJECT || 'mailto:admin@99copias.com',
      publicKey: env.VAPID_PUBLIC_KEY,
      privateKey: env.VAPID_PRIVATE_KEY,
    };

    const detalle = [trabajo.categoria_nombre, fmtMoneda(trabajo.total), trabajo.con_envio ? '🚚 Envío' : '🏠 Retiro']
      .filter(Boolean)
      .join(' · ');

    const payload = {
      title: `Nuevo pedido #${trabajo.id}`,
      body: `${trabajo.nombre} ${trabajo.apellido} · ${detalle}`,
      url: `/index.html?pedido=${trabajo.id}`,
      tag: `pedido-${trabajo.id}`,
    };

    let enviados = 0;
    let fallidos = 0;

    await Promise.all(
      suscripciones.map(async (sub) => {
        const subscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        };
        try {
          const ok = await sendPushNotification(subscription, payload, vapid, { ttl: 3600 });
          if (ok) {
            enviados++;
          } else {
            // sendPushNotification devuelve false cuando el push service
            // contesta 404/410: la suscripción venció o fue revocada.
            fallidos++;
            await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(sub.id).run();
          }
        } catch (e) {
          // error de red/servidor puntual: no borramos la suscripción,
          // podría ser algo temporal.
          fallidos++;
        }
      })
    );

    return json({ ok: true, enviados, fallidos });
  } catch (e) {
    return errorJson(`Error enviando notificaciones: ${e.message}`, 500);
  }
}
