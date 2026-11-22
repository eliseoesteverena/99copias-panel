// GET /api/reportes/ventas?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&vista=total|productos
//
// Venta = pedido con pagado = 1. Fecha = trabajos.creado_en pasado a hora Argentina
// (UTC-3, sin horario de verano). Las fechas desde/hasta son inclusivas y en hora local.
// "total" incluye envío; "productos" sale de configuracion.items[] (sin envío).

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DIA_LOCAL = "date(t.creado_en, '-3 hours')";
// medio_pago de trabajos solo lo llenan los pedidos manuales (y el backfill de la migración);
// los pedidos web nuevos no lo setean, así que se cae a pagos.medio.
const MEDIO = `COALESCE(t.medio_pago,
  (SELECT p.medio FROM pagos p WHERE p.trabajo_id = t.id ORDER BY p.id DESC LIMIT 1), 'sin_dato')`;

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const desde = url.searchParams.get('desde') || '';
    const hasta = url.searchParams.get('hasta') || '';
    const vista = url.searchParams.get('vista') === 'productos' ? 'productos' : 'total';

    if (!FECHA.test(desde) || !FECHA.test(hasta)) {
      return Response.json({ error: 'Fechas inválidas (usar YYYY-MM-DD).' }, { status: 400 });
    }
    if (desde > hasta) {
      return Response.json({ error: 'La fecha "desde" no puede ser posterior a "hasta".' }, { status: 400 });
    }
    if ((Date.parse(hasta) - Date.parse(desde)) / 86400000 > 731) {
      return Response.json({ error: 'El rango máximo es de 2 años.' }, { status: 400 });
    }

    const db = env.DB;
    const rango = [desde, hasta];
    const donde = `t.pagado = 1 AND ${DIA_LOCAL} BETWEEN ? AND ?`;
    const all = async (sql) => (await db.prepare(sql).bind(...rango).all()).results || [];

    if (vista === 'total') {
      const resumen = await db.prepare(
        `SELECT COUNT(*) AS pedidos, COALESCE(SUM(t.total),0) AS total, COALESCE(SUM(t.costo_envio),0) AS envio
           FROM trabajos t WHERE ${donde}`
      ).bind(...rango).first();

      const por_dia = await all(
        `SELECT ${DIA_LOCAL} AS dia, COUNT(*) AS pedidos, SUM(t.total) AS total
           FROM trabajos t WHERE ${donde} GROUP BY dia ORDER BY dia`
      );
      const por_medio = await all(
        `SELECT ${MEDIO} AS medio, COUNT(*) AS pedidos, SUM(t.total) AS total
           FROM trabajos t WHERE ${donde} GROUP BY medio ORDER BY total DESC`
      );
      const por_origen = await all(
        `SELECT COALESCE(t.origen,'web') AS origen, COUNT(*) AS pedidos, SUM(t.total) AS total
           FROM trabajos t WHERE ${donde} GROUP BY origen ORDER BY total DESC`
      );

      return Response.json({
        vista, desde, hasta,
        resumen: { ...resumen, ticket: resumen.pedidos ? resumen.total / resumen.pedidos : 0 },
        por_dia, por_medio, por_origen,
      });
    }

    // --- Por producto ---
    const primarios = await all(
      `SELECT x.codigo, p.descripcion, c.nombre AS categoria,
              x.pedidos, x.copias, x.carillas, x.facturado
         FROM (SELECT json_extract(i.value,'$.producto_primario') AS codigo,
                      COUNT(DISTINCT t.id) AS pedidos,
                      SUM(json_extract(i.value,'$.copias'))  AS copias,
                      SUM(json_extract(i.value,'$.carillas')) AS carillas,
                      SUM(json_extract(i.value,'$.subtotal_primario')) AS facturado
                 FROM trabajos t, json_each(t.configuracion,'$.items') i
                WHERE ${donde} AND json_extract(i.value,'$.producto_primario') IS NOT NULL
                GROUP BY codigo) x
         LEFT JOIN productos p ON p.codigo = x.codigo
         LEFT JOIN categorias c ON c.id = p.categoria_id
        ORDER BY x.facturado DESC`
    );
    const acabados = await all(
      `SELECT x.codigo, p.descripcion, x.pedidos, x.unidades, x.facturado
         FROM (SELECT json_extract(i.value,'$.producto_secundario') AS codigo,
                      COUNT(DISTINCT t.id) AS pedidos,
                      SUM(json_extract(i.value,'$.copias')) AS unidades,
                      SUM(json_extract(i.value,'$.subtotal_secundario')) AS facturado
                 FROM trabajos t, json_each(t.configuracion,'$.items') i
                WHERE ${donde} AND json_extract(i.value,'$.producto_secundario') IS NOT NULL
                GROUP BY codigo) x
         LEFT JOIN productos p ON p.codigo = x.codigo
        ORDER BY x.facturado DESC`
    );

    // Conciliación: total de pedidos = ítems + envío + ajustes (precio pisado en pedidos
    // manuales, o pedidos sin items). Así la tabla siempre cierra con "Ventas totales".
    const tot = await db.prepare(
      `SELECT COUNT(*) AS pedidos, COALESCE(SUM(t.total),0) AS total, COALESCE(SUM(t.costo_envio),0) AS envio
         FROM trabajos t WHERE ${donde}`
    ).bind(...rango).first();
    const suma = (arr) => arr.reduce((a, r) => a + (r.facturado || 0), 0);
    const items = suma(primarios) + suma(acabados);

    return Response.json({
      vista, desde, hasta, primarios, acabados,
      conciliacion: {
        pedidos: tot.pedidos, items, envio: tot.envio,
        ajustes: tot.total - tot.envio - items, total: tot.total,
      },
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: err.message || 'No se pudo generar el reporte.' }, { status: 500 });
  }
}
