import { json, errorJson, readJson } from '../lib/utils.js';

// Cancelación masiva de entregas: una o varias fechas (rango) × una o todas las zonas, en una
// sola operación. Para cada fecha, cancela los turnos recurrentes activos que caen ese día de la
// semana. Todas las excepciones creadas en la misma operación comparten `lote_id`, así se
// muestran agrupadas y se revierten juntas.
//
// POST   /api/turnos-excepciones/lote
//   body: { fecha_desde, fecha_hasta?, zona_ids?, motivo?, dry_run? }
//     - fecha_hasta vacía = solo fecha_desde (rango inclusive en ambos extremos)
//     - zona_ids vacío/ausente = todas las zonas activas
//     - dry_run: true => no escribe nada, solo informa qué haría y qué pedidos hay afectados
// DELETE /api/turnos-excepciones/lote?lote_id=...  => revierte todo el lote (borra sus excepciones)
//
// Los pedidos ya hechos para esas fechas NO se tocan: la cancelación solo impide pedidos nuevos
// (el Wizard ya ignora turnos cancelados en GET /api/turnos y los rechaza en POST /api/trabajos).
// Por eso la respuesta los lista, para que el operador pueda avisarles.

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DIAS = 366;
const TAM_LOTE_BATCH = 100; // statements por db.batch()
const MAX_PEDIDOS_LISTADOS = 100;

function fechasEntre(desde, hasta) {
  const fechas = [];
  const fin = new Date(hasta + 'T00:00:00Z');
  for (let d = new Date(desde + 'T00:00:00Z'); d <= fin; d.setUTCDate(d.getUTCDate() + 1)) {
    fechas.push(d.toISOString().slice(0, 10));
  }
  return fechas;
}

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body || !RE_FECHA.test(body.fecha_desde || '')) {
    return errorJson('fecha_desde es requerida (YYYY-MM-DD)', 400);
  }
  const desde = body.fecha_desde;
  const hasta = body.fecha_hasta ? body.fecha_hasta : desde;
  if (!RE_FECHA.test(hasta) || hasta < desde) {
    return errorJson('fecha_hasta debe tener formato YYYY-MM-DD y no ser anterior a fecha_desde', 400);
  }
  const fechas = fechasEntre(desde, hasta);
  if (fechas.length > MAX_DIAS) {
    return errorJson(`El rango no puede superar ${MAX_DIAS} días`, 400);
  }
  const motivo = body.motivo ? String(body.motivo).trim().slice(0, 200) || null : null;
  const dryRun = body.dry_run === true;

  let zonaIds = null;
  if (Array.isArray(body.zona_ids) && body.zona_ids.length) {
    zonaIds = body.zona_ids.map(Number);
    if (zonaIds.some((z) => !Number.isInteger(z))) return errorJson('zona_ids inválido', 400);
  }

  try {
    // Turnos recurrentes activos, de zonas activas (o de las zonas pedidas).
    let sql = `SELECT t.id, t.zona_id, t.dia_semana, t.hora_inicio, t.hora_fin, z.nombre AS zona_nombre
                 FROM turnos_entrega t
                 JOIN zonas z ON z.id = t.zona_id
                WHERE t.activo = 1 AND z.activa = 1`;
    const params = [];
    if (zonaIds) {
      sql += ` AND t.zona_id IN (${zonaIds.map(() => '?').join(',')})`;
      params.push(...zonaIds);
    }
    const { results: turnos } = await env.DB.prepare(sql).bind(...params).all();

    // Combinaciones (turno, fecha) que caen en el rango.
    const objetivos = [];
    for (const fecha of fechas) {
      const dia = new Date(fecha + 'T00:00:00Z').getUTCDay();
      for (const t of turnos) if (t.dia_semana === dia) objetivos.push({ turno: t, fecha });
    }
    if (!objetivos.length) {
      return errorJson('No hay turnos activos en esas fechas para las zonas elegidas', 400);
    }

    // Excepciones ya existentes en el rango, indexadas por turno|fecha.
    const { results: existentes } = await env.DB.prepare(
      'SELECT turno_entrega_id, fecha, tipo FROM turnos_excepciones WHERE fecha BETWEEN ? AND ?'
    ).bind(desde, hasta).all();
    const porClave = new Map(existentes.map((e) => [`${e.turno_entrega_id}|${e.fecha}`, e.tipo]));

    const aCancelar = [];
    let yaCanceladas = 0;
    let reemplazadas = 0;
    for (const o of objetivos) {
      const previa = porClave.get(`${o.turno.id}|${o.fecha}`);
      if (previa === 'cancelado') { yaCanceladas++; continue; }
      if (previa) reemplazadas++; // capacidad_modificada / horario_modificado => se pisa
      aCancelar.push(o);
    }

    // Pedidos ya hechos en esos turnos/fechas (sin contar los ya entregados).
    const claves = new Set(objetivos.map((o) => `${o.turno.id}|${o.fecha}`));
    const turnoPorId = new Map(turnos.map((t) => [t.id, t]));
    const { results: trabajos } = await env.DB.prepare(
      `SELECT id, fecha_entrega, turno_entrega_id, estado, pagado
         FROM trabajos
        WHERE fecha_entrega BETWEEN ? AND ? AND estado != 'entregado'
        ORDER BY fecha_entrega, id`
    ).bind(desde, hasta).all();
    const pedidos = trabajos
      .filter((tr) => claves.has(`${tr.turno_entrega_id}|${tr.fecha_entrega}`))
      .map((tr) => {
        const t = turnoPorId.get(tr.turno_entrega_id);
        return {
          id: tr.id, fecha: tr.fecha_entrega, estado: tr.estado, pagado: !!tr.pagado,
          zona: t ? t.zona_nombre : null, horario: t ? `${t.hora_inicio}–${t.hora_fin}` : null,
        };
      });

    const resumen = {
      turnos_a_cancelar: aCancelar.length,
      ya_canceladas: yaCanceladas,
      reemplazadas, // excepciones de capacidad/horario que se pisan con la cancelación
      zonas: [...new Set(aCancelar.map((o) => o.turno.zona_nombre))],
      pedidos_afectados: pedidos.length,
      pedidos_pagados: pedidos.filter((p) => p.pagado).length,
      pedidos: pedidos.slice(0, MAX_PEDIDOS_LISTADOS),
    };

    if (dryRun) return json({ ok: true, dry_run: true, ...resumen });

    if (!aCancelar.length) {
      return json({ ok: true, dry_run: false, lote_id: null, ...resumen });
    }

    const loteId = crypto.randomUUID();
    const stmts = aCancelar.map((o) =>
      env.DB.prepare(
        `INSERT INTO turnos_excepciones (turno_entrega_id, fecha, tipo, capacidad_maxima, hora_inicio, hora_fin, motivo, lote_id)
         VALUES (?, ?, 'cancelado', NULL, NULL, NULL, ?, ?)
         ON CONFLICT(turno_entrega_id, fecha) DO UPDATE SET
           tipo = 'cancelado', capacidad_maxima = NULL, hora_inicio = NULL, hora_fin = NULL,
           motivo = excluded.motivo, lote_id = excluded.lote_id`
      ).bind(o.turno.id, o.fecha, motivo, loteId)
    );
    for (let i = 0; i < stmts.length; i += TAM_LOTE_BATCH) {
      await env.DB.batch(stmts.slice(i, i + TAM_LOTE_BATCH));
    }

    return json({ ok: true, dry_run: false, lote_id: loteId, ...resumen }, 201);
  } catch (e) {
    return errorJson(`Error cancelando las entregas: ${e.message}`, 500);
  }
}

// DELETE /api/turnos-excepciones/lote?lote_id=...
export async function onRequestDelete({ request, env }) {
  const loteId = new URL(request.url).searchParams.get('lote_id');
  if (!loteId) return errorJson('Falta lote_id', 400);
  try {
    const res = await env.DB.prepare('DELETE FROM turnos_excepciones WHERE lote_id = ?')
      .bind(loteId)
      .run();
    return json({ ok: true, lote_id: loteId, eliminadas: res.meta.changes ?? 0 });
  } catch (e) {
    return errorJson(`Error revirtiendo la cancelación: ${e.message}`, 500);
  }
}
