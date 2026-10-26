import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const PORT = Number(process.env.PORT || 8787);
const dist = resolve("dist");
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

createServer(async (req, res) => {
  try {
    const parsed = new URL(req.url, `http://localhost:${PORT}`);
    if (parsed.pathname === "/api/cima/medicamentos") {
      if (req.method !== "GET") { res.writeHead(405).end(); return; }
      const nombre = (parsed.searchParams.get("nombre") || "").trim();
      if (nombre.length < 3 || nombre.length > 120) {
        res.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Consulta no válida" })); return;
      }
      const upstream = new URL("https://cima.aemps.es/cima/rest/medicamentos");
      upstream.searchParams.set("nombre", nombre);
      upstream.searchParams.set("pagina", "1");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      let response;
      try { response = await fetch(upstream, { headers: { Accept: "application/json" }, signal: controller.signal }); }
      finally { clearTimeout(timer); }
      const data = await response.text();
      if (!response.ok) {
        res.writeHead(502, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        res.end(JSON.stringify({ error: `CIMA respondió HTTP ${response.status}; revisar disponibilidad del servicio oficial.` }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      res.end(data);
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405).end(); return; }
    const rel = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
    let file = resolve(dist, rel || "index.html");
    if (file !== dist && !file.startsWith(dist + sep)) { res.writeHead(403).end(); return; }
    try { if (!(await stat(file)).isFile()) file = resolve(dist, "index.html"); }
    catch { file = resolve(dist, "index.html"); }
    const buffer = await readFile(file);
    res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
    res.end(req.method === "HEAD" ? undefined : buffer);
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Servicio no disponible" }));
    console.error(err);
  }
}).listen(PORT, () => console.log(`Aplicación disponible en http://localhost:${PORT}`));
