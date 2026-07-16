// functions/api/zonas.js
//
// GET /api/zonas — todas las zonas (activas e inactivas), para el filtro
// del listado de pedidos. El ABM completo de zonas se agrega más adelante.

export async function onRequestGet(context) {
  const { env } = context;
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, nombre, activa FROM zonas ORDER BY nombre ASC"
    ).all();
    return Response.json({ zonas: results });
  } catch (err) {
    return Response.json({ error: "Error consultando zonas: " + err.message }, { status: 500 });
  }
}
