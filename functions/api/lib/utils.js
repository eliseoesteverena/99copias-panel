// Helpers compartidos por todas las Pages Functions del panel.
// Mantiene la misma convención de respuestas que el wizard: JSON con
// { "error": "mensaje" } y el status HTTP correspondiente.

export function json(data, status = 200) {
  return Response.json(data, { status });
}

export function errorJson(mensaje, status = 400) {
  return Response.json({ error: mensaje }, { status });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// Valida que una r2_key pertenezca efectivamente a un trabajo dado, para
// evitar que alguien pida un key arbitrario (incluyendo algo bajo staging/).
export function keyPerteneceATrabajo(key, trabajoId) {
  if (typeof key !== 'string') return false;
  return key.startsWith(`trabajos/${trabajoId}/`);
}

export function sanitizeForHeader(nombre) {
  // Content-Disposition no admite ciertos caracteres crudos; nos quedamos
  // con una versión ascii simple y mandamos el nombre real vía filename*.
  return nombre.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, "'");
}
