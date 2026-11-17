import { json, errorJson, readJson } from '../lib/utils.js';
import { normalizarIds, resumenEliminacion, eliminarTurnos } from '../lib/turnos-eliminar.js';

// POST /api/turnos/eliminar-lote
//   body: { ids: [..], dry_run? }
//   dry_run: true => no escribe nada; informa cuántos turnos son y cuántos pedidos futuros
//   tienen asociados, para que la UI pida confirmación con ese dato.
// Sirve para eliminar un turno, un horario completo (varios días) o lo que se necesite.
const MAX_IDS = 500;

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const ids = normalizarIds(body && body.ids);
  if (!ids.length) return errorJson('Falta ids (lista de turnos a eliminar)', 400);
  if (ids.length > MAX_IDS) return errorJson(`No se pueden eliminar más de ${MAX_IDS} turnos juntos`, 400);

  try {
    const { ids_existentes, ...resumen } = await resumenEliminacion(env.DB, ids);
    if (body.dry_run === true) return json({ ok: true, dry_run: true, ...resumen });
    if (!resumen.turnos) return errorJson('Esos turnos ya no existen', 404);

    const res = await eliminarTurnos(env.DB, ids);
    return json({ ok: true, dry_run: false, ...resumen, ...res });
  } catch (e) {
    return errorJson(`Error eliminando los turnos: ${e.message}`, 500);
  }
}
