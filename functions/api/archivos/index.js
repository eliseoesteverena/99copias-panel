import { errorJson, keyPerteneceATrabajo, sanitizeForHeader } from '../lib/utils.js';

// GET /api/archivos?trabajo_id=42&key=trabajos/42/1-apunte.pdf&dl=1
// Sirve un archivo privado de R2. dl=1 fuerza descarga (attachment),
// sin dl abre inline (para "abrir en pestaña nueva").
// Nunca sirve nada bajo staging/ ni de otro trabajo (ver keyPerteneceATrabajo).
export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const trabajoId = url.searchParams.get('trabajo_id');
  const key = url.searchParams.get('key');
  const forzarDescarga = url.searchParams.get('dl') === '1';

  if (!trabajoId || !key) {
    return errorJson('Faltan parámetros: trabajo_id y key son requeridos', 400);
  }
  if (!keyPerteneceATrabajo(key, trabajoId)) {
    return errorJson('Key inválida para este pedido', 403);
  }

  try {
    const objeto = await env.BUCKET.get(key);
    if (!objeto) return errorJson('Archivo no encontrado en el bucket', 404);

    const nombreArchivo = key.split('/').pop();
    const headers = new Headers();
    objeto.writeHttpMetadata(headers);
    headers.set('etag', objeto.httpEtag);
    if (!headers.get('content-type')) {
      headers.set('content-type', 'application/octet-stream');
    }
    const disposicion = forzarDescarga ? 'attachment' : 'inline';
    headers.set(
      'content-disposition',
      `${disposicion}; filename="${sanitizeForHeader(nombreArchivo)}"; filename*=UTF-8''${encodeURIComponent(nombreArchivo)}`
    );

    return new Response(objeto.body, { headers });
  } catch (e) {
    return errorJson(`Error leyendo el archivo: ${e.message}`, 500);
  }
}
