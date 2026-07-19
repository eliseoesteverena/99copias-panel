import { crearZip } from '../lib/zip.js';
import { errorJson, readJson, keyPerteneceATrabajo } from '../lib/utils.js';

// POST /api/archivos/zip   body: { trabajo_id, keys: ["trabajos/42/1-a.pdf", ...] }
// Arma un .zip en memoria con los archivos pedidos y lo devuelve.
// R2 no genera zips server-side por sí solo, así que lo armamos acá con un
// armador de zip propio (sin comprimir, método "store") en vez de una
// librería externa: el build de Cloudflare Pages vía dashboard/Git no corre
// `npm install` antes de bundlear las Functions, así que cualquier
// dependencia de npm rompe el deploy con "Could not resolve".
export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const trabajoId = body?.trabajo_id;
  const keys = body?.keys;

  if (!trabajoId || !Array.isArray(keys) || keys.length === 0) {
    return errorJson('Faltan parámetros: trabajo_id y keys[] son requeridos', 400);
  }
  if (keys.length > 100) {
    return errorJson('Demasiados archivos para un solo zip (máx. 100)', 400);
  }
  for (const key of keys) {
    if (!keyPerteneceATrabajo(key, trabajoId)) {
      return errorJson(`Key inválida para este pedido: ${key}`, 403);
    }
  }

  try {
    const archivosZip = {};
    const usados = new Set();

    for (const key of keys) {
      const objeto = await env.BUCKET.get(key);
      if (!objeto) {
        // Si falta un archivo puntual no abortamos todo el zip, lo salteamos
        // y avisamos al final vía header.
        continue;
      }
      const buffer = new Uint8Array(await objeto.arrayBuffer());
      let nombre = key.split('/').pop();
      // Evita colisiones de nombre dentro del zip
      let nombreFinal = nombre;
      let i = 2;
      while (usados.has(nombreFinal)) {
        nombreFinal = `(${i}) ${nombre}`;
        i++;
      }
      usados.add(nombreFinal);
      archivosZip[nombreFinal] = buffer;
    }

    if (Object.keys(archivosZip).length === 0) {
      return errorJson('Ninguno de los archivos pedidos se encontró en el bucket', 404);
    }

    const zipBytes = crearZip(archivosZip);
    const faltantes = keys.length - Object.keys(archivosZip).length;

    const headers = new Headers({
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="pedido-${trabajoId}.zip"`,
    });
    if (faltantes > 0) {
      headers.set('x-archivos-faltantes', String(faltantes));
    }

    return new Response(zipBytes, { headers });
  } catch (e) {
    return errorJson(`Error armando el zip: ${e.message}`, 500);
  }
}
