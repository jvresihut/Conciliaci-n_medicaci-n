
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Método no permitido" });
  }

  const nombre = String(req.query.nombre || "").trim();
  const pagina = String(req.query.pagina || "1");

  if (nombre.length < 3) {
    return res.status(400).json({
      error: "Introduce al menos 3 caracteres"
    });
  }

  try {
    const url = new URL(
      "https://cima.aemps.es/cima/rest/medicamentos"
    );

    url.searchParams.set("nombre", nombre);
    url.searchParams.set("pagina", pagina);

    const respuesta = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(12000)
    });

    if (!respuesta.ok) {
      return res.status(502).json({
        error: `CIMA respondió HTTP ${respuesta.status}`
      });
    }

    const datos = await respuesta.json();

    return res.status(200).json(datos);
  } catch (error) {
    return res.status(502).json({
      error: "No se pudo conectar con CIMA",
      detalle: error.message
    });
  }
}
