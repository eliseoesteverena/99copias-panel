// functions/api/pedidos/[id]/archivo.js
//
// GET /api/pedidos/:id/archivo?key=trabajos/42/1-apunte.pdf
//
// El bucket R2 es privado (sección 6 del contexto): no hay URLs públicas.
// Esta Function lee el objeto con el binding y lo devuelve como response.
//
// Validaciones antes de tocar R2 (defensa en profundidad, no solo confiar
// en que el frontend mande una key "razonable"):
//   1. La key tiene que empezar con "trabajos/{id}/" — nunca "staging/..."
//      ni la carpeta de otro pedido.
//   2. La key tiene que estar realmente en configuracion.archivos del pedido
//      pedido (no alcanza con "parecer" válida).

export async function onRequestGet(context) {
  const { env, params, request } = context;
  const id = Number(params.id);
  const url = new URL(request.url);
  const key = url.searchParams.get("key");

  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "id de pedido inválido" }, { status: 400 });
  }
  if (!key) {
    return Response.json({ error: "Falta el parámetro key" }, { status: 400 });
  }

  const prefijoEsperado = `trabajos/${id}/`;
  if (!key.startsWith(prefijoEsperado)) {
    return Response.json({ error: "key no pertenece a este pedido" }, { status: 400 });
  }

  try {
    const row = await env.DB.prepare("SELECT configuracion FROM trabajos WHERE id = ?").bind(id).first();
    if (!row) {
      return Response.json({ error: "Pedido no encontrado" }, { status: 404 });
    }

    let configuracion;
    try {
      configuracion = JSON.parse(row.configuracion || "{}");
    } catch {
      return Response.json({ error: "configuracion del pedido corrupta" }, { status: 500 });
    }

    const archivo = (configuracion.archivos || []).find((a) => a.r2_key === key);
    if (!archivo) {
      return Response.json({ error: "Ese archivo no está registrado en este pedido" }, { status: 404 });
    }

    const objeto = await env.BUCKET.get(key);
    if (!objeto) {
      return Response.json({ error: "El archivo no está (o ya no está) en R2" }, { status: 404 });
    }

    const headers = new Headers();
    objeto.writeHttpMetadata(headers);
    headers.set("Content-Disposition", `attachment; filename="${(archivo.nombre || "archivo").replace(/"/g, "")}"`);
    if (!headers.get("Content-Type")) headers.set("Content-Type", "application/octet-stream");
    headers.set("Content-Length", String(objeto.size));

    return new Response(objeto.body, { headers });
  } catch (err) {
    return Response.json({ error: "Error sirviendo el archivo: " + err.message }, { status: 500 });
  }
}
