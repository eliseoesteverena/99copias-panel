import { json, errorJson, readJson } from '../lib/utils.js';

// Creación masiva de turnos recurrentes: varias zonas × varios días de la semana, con el mismo
// horario y capacidad. Ej.: lunes a viernes, 15:00–18:00, en Belgrano, Palermo y Núñez.
//
// POST /api/turnos/lote
//   body: { zona_ids: [..], dias_semana: [..], hora_inicio, hora_fin, capacidad_maxima?, activo? }
//     - dias_semana: 0 (domingo) … 6 (sábado)
//     - capacidad_maxima vacío/null = sin límite
// Los turnos que ya existen EXACTAMENTE igual (misma zona, día y horario) se omiten, así volver
// a ejecutar la misma carga no duplica nada. Un turno con horario distinto sobre el mismo día
// sí se crea (el Panel nunca prohibió turnos superpuestos); la UI avisa de las superposiciones.

const RE_HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const TAM_LOTE_BATCH = 100; // statements por db.batch()

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return errorJson('Body inválido', 400);

  const zonaIds = [...new Set((Array.isArray(body.zona_ids) ? body.zona_ids : []).map(Number))];
  const dias = [...new Set((Array.isArray(body.dias_semana) ? body.dias_semana : []).map(Number))];
  if (!zonaIds.length) return errorJson('Elegí al menos una zona', 400);
  if (!dias.length) return errorJson('Elegí al menos un día de la semana', 400);
  if (zonaIds.some((z) => !Number.isInteger(z))) return errorJson('zona_ids inválido', 400);
  if (dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
    return errorJson('dias_semana debe contener enteros entre 0 (domingo) y 6 (sábado)', 400);
  }

  const { hora_inicio: inicio, hora_fin: fin } = body;
  if (!RE_HORA.test(inicio || '') || !RE_HORA.test(fin || '')) {
    return errorJson('hora_inicio y hora_fin deben tener formato HH:MM', 400);
  }
  if (fin <= inicio) return errorJson('La hora de fin tiene que ser posterior a la de inicio', 400);

  const capacidad =
    body.capacidad_maxima === '' || body.capacidad_maxima === undefined || body.capacidad_maxima === null
      ? null
      : Number(body.capacidad_maxima);
  if (capacidad !== null && (!Number.isInteger(capacidad) || capacidad < 0)) {
    return errorJson('capacidad_maxima debe ser un entero mayor o igual a 0 (o vacío = sin límite)', 400);
  }
  const activo = body.activo === false ? 0 : 1;

  try {
    const marcas = zonaIds.map(() => '?').join(',');
    const { results: zonas } = await env.DB.prepare(`SELECT id FROM zonas WHERE id IN (${marcas})`)
      .bind(...zonaIds)
      .all();
    if (zonas.length !== zonaIds.length) {
      const ok = new Set(zonas.map((z) => z.id));
      return errorJson(`Zonas inexistentes: ${zonaIds.filter((z) => !ok.has(z)).join(', ')}`, 404);
    }

    // Duplicados exactos ya existentes (cualquier estado, activo o no).
    const { results: existentes } = await env.DB.prepare(
      `SELECT zona_id, dia_semana FROM turnos_entrega
        WHERE zona_id IN (${marcas}) AND hora_inicio = ? AND hora_fin = ?`
    ).bind(...zonaIds, inicio, fin).all();
    const yaExiste = new Set(existentes.map((t) => `${t.zona_id}|${t.dia_semana}`));

    const nuevos = [];
    let omitidos = 0;
    for (const zonaId of zonaIds) {
      for (const dia of dias) {
        if (yaExiste.has(`${zonaId}|${dia}`)) omitidos++;
        else nuevos.push({ zonaId, dia });
      }
    }

    const stmts = nuevos.map((n) =>
      env.DB.prepare(
        `INSERT INTO turnos_entrega (zona_id, dia_semana, hora_inicio, hora_fin, capacidad_maxima, activo)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).bind(n.zonaId, n.dia, inicio, fin, capacidad, activo)
    );
    for (let i = 0; i < stmts.length; i += TAM_LOTE_BATCH) {
      await env.DB.batch(stmts.slice(i, i + TAM_LOTE_BATCH));
    }

    return json({ ok: true, creados: nuevos.length, omitidos }, nuevos.length ? 201 : 200);
  } catch (e) {
    return errorJson(`Error creando los turnos: ${e.message}`, 500);
  }
}
