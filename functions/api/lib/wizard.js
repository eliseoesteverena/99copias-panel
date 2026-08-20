// Helper para las llamadas salientes del Panel hacia el Wizard
// (POST /api/panel/comprobante-revisado y POST /api/panel/estado-actualizado,
// documentadas en CONTEXTO_PANEL_FASES_2_3_4.md). Requiere:
//   env.WIZARD_URL           -> ej. "https://app.99copias.com.ar"
//   env.WIZARD_API_SECRET    -> mismo valor que PANEL_API_SECRET del lado del wizard

/**
 * @param {object} env
 * @param {string} path - ej. "/api/panel/estado-actualizado"
 * @param {object} body
 * @returns {Promise<{ok: boolean, status: number, data: any, error?: string}>}
 *   Nunca tira excepción — cualquier fallo (red, timeout, respuesta no-2xx)
 *   vuelve como { ok: false, error: "..." } para que el que llama decida
 *   qué hacer (bloquear la acción o solo avisar, según el caso).
 */
export async function llamarWizard(env, path, body) {
  if (!env.WIZARD_URL) {
    return { ok: false, status: 0, data: null, error: 'Falta configurar WIZARD_URL en este proyecto' };
  }
  if (!env.WIZARD_API_SECRET) {
    return { ok: false, status: 0, data: null, error: 'Falta configurar el secret WIZARD_API_SECRET en este proyecto' };
  }

  try {
    const res = await fetch(`${env.WIZARD_URL}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-panel-secret': env.WIZARD_API_SECRET,
      },
      body: JSON.stringify(body),
    });

    const texto = await res.text();
    let data = null;
    if (texto) {
      try {
        data = JSON.parse(texto);
      } catch {
        // el wizard no devolvió JSON válido; seguimos con data null
      }
    }

    if (!res.ok) {
      const detalle = (data && data.error) || texto.slice(0, 200) || `status ${res.status}`;
      return { ok: false, status: res.status, data, error: detalle };
    }

    return { ok: true, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: null, error: e.message || String(e) };
  }
}
