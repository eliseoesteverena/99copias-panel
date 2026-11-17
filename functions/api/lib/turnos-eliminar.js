// Eliminación de turnos recurrentes, compartida por DELETE /api/turnos/:id y
// POST /api/turnos/eliminar-lote.
//
//  - Turno SIN pedidos asociados  -> se borra de verdad (junto con sus excepciones).
//  - Turno CON pedidos asociados  -> baja lógica: activo = 0 y eliminado = 1. Desaparece del
//    Panel y deja de ofrecerse en el Wizard, pero los pedidos viejos siguen apuntando a él.
// En ambos casos se borran sus excepciones: sin turno, una excepción no significa nada.

const TAM = 50; // ids por statement (D1 limita los parámetros por consulta)

const marcas = (n) => new Array(n).fill('?').join(',');
const trozos = (arr) => {
  const out = [];
  for (let i = 0; i < arr.length; i += TAM) out.push(arr.slice(i, i + TAM));
  return out;
};

// Argentina (UTC-3): "hoy" para decidir qué pedidos son futuros.
const hoyAR = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

export function normalizarIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).map(Number))].filter(
    (n) => Number.isInteger(n) && n > 0
  );
}

// Qué pasaría si se eliminan estos turnos (no escribe nada).
export async function resumenEliminacion(db, ids) {
  const existentes = [];
  const conPedidos = new Set();
  let futuros = 0;
  let pagados = 0;
  const hoy = hoyAR();

  for (const chunk of trozos(ids)) {
    const { results: filas } = await db
      .prepare(`SELECT id FROM turnos_entrega WHERE eliminado = 0 AND id IN (${marcas(chunk.length)})`)
      .bind(...chunk)
      .all();
    const vivos = filas.map((f) => f.id);
    if (!vivos.length) continue;
    existentes.push(...vivos);

    const { results: usados } = await db
      .prepare(`SELECT DISTINCT turno_entrega_id AS id FROM trabajos WHERE turno_entrega_id IN (${marcas(vivos.length)})`)
      .bind(...vivos)
      .all();
    usados.forEach((u) => conPedidos.add(u.id));

    const fut = await db
      .prepare(
        `SELECT COUNT(*) AS n, COALESCE(SUM(pagado), 0) AS pagados
           FROM trabajos
          WHERE turno_entrega_id IN (${marcas(vivos.length)})
            AND fecha_entrega >= ? AND estado != 'entregado'`
      )
      .bind(...vivos, hoy)
      .first();
    futuros += fut.n || 0;
    pagados += fut.pagados || 0;
  }

  return {
    ids_existentes: existentes,
    turnos: existentes.length,
    con_historial: existentes.filter((id) => conPedidos.has(id)).length,
    pedidos_futuros: futuros,
    pedidos_pagados: pagados,
  };
}

export async function eliminarTurnos(db, ids) {
  const r = await resumenEliminacion(db, ids);
  const conHistorial = new Set();
  for (const chunk of trozos(r.ids_existentes)) {
    const { results } = await db
      .prepare(`SELECT DISTINCT turno_entrega_id AS id FROM trabajos WHERE turno_entrega_id IN (${marcas(chunk.length)})`)
      .bind(...chunk)
      .all();
    results.forEach((u) => conHistorial.add(u.id));
  }

  let archivados = 0;
  let borrados = 0;
  for (const chunk of trozos(r.ids_existentes)) {
    const archivar = chunk.filter((id) => conHistorial.has(id));
    const borrar = chunk.filter((id) => !conHistorial.has(id));
    const stmts = [
      db.prepare(`DELETE FROM turnos_excepciones WHERE turno_entrega_id IN (${marcas(chunk.length)})`).bind(...chunk),
    ];
    if (archivar.length) {
      stmts.push(
        db.prepare(`UPDATE turnos_entrega SET activo = 0, eliminado = 1 WHERE id IN (${marcas(archivar.length)})`).bind(...archivar)
      );
    }
    if (borrar.length) {
      stmts.push(db.prepare(`DELETE FROM turnos_entrega WHERE id IN (${marcas(borrar.length)})`).bind(...borrar));
    }
    await db.batch(stmts); // una transacción por tanda
    archivados += archivar.length;
    borrados += borrar.length;
  }
  return { eliminados: archivados + borrados, archivados, borrados };
}
