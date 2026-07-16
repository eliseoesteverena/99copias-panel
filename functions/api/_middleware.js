// functions/api/_middleware.js
//
// Corre antes de CUALQUIER función bajo /api/*. Si el token no es válido,
// cortamos acá y ninguna ruta individual tiene que reimplementar el chequeo.

import { verifyAuth } from "../lib/auth.js";

export async function onRequest(context) {
  const { request, env, next, data } = context;

  const result = await verifyAuth(request, env);
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  // Dejamos los claims disponibles para las rutas siguientes (ej. auditoría:
  // quién cambió el estado de un pedido).
  data.user = result.claims;

  return next();
}
