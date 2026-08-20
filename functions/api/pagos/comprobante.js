import { errorJson } from '../lib/utils.js';

// GET /api/pagos/comprobante?pago_id=123
// A diferencia de /api/archivos, acá el cliente NUNCA manda la r2_key
// directamente — solo el pago_id, y la key se resuelve server-side contra
// la tabla `pagos`. Evita cualquier posibilidad de pedir un objeto de R2
// arbitrario armando la URL a mano.
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const pagoId = url.searchParams.get('pago_id');
  if (!pagoId) return errorJson('Falta el parámetro pago_id', 400);

  try {
    const pago = await env.DB.prepare(
      'SELECT id, comprobante_r2_key FROM pagos WHERE id = ?'
    )
      .bind(pagoId)
      .first();

    if (!pago) return errorJson('Pago no encontrado', 404);
    if (!pago.comprobante_r2_key) return errorJson('Este pago no tiene comprobante adjunto', 404);

    const objeto = await env.BUCKET.get(pago.comprobante_r2_key);
    if (!objeto) return errorJson('El archivo no está en el bucket', 404);

    const nombreArchivo = pago.comprobante_r2_key.split('/').pop();
    const headers = new Headers();
    objeto.writeHttpMetadata(headers);
    headers.set('etag', objeto.httpEtag);
    if (!headers.get('content-type')) headers.set('content-type', 'application/octet-stream');
    headers.set('content-disposition', `inline; filename*=UTF-8''${encodeURIComponent(nombreArchivo)}`);

    return new Response(objeto.body, { headers });
  } catch (e) {
    return errorJson(`Error leyendo el comprobante: ${e.message}`, 500);
  }
}
