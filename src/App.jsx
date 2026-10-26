import { useState, useRef, useEffect } from "react";

// ── FUENTES BASE HARDCODED (siempre activas, no borrables) ───────────────────
const FUENTES_HARDCODED = [
  { nombre: "Guía Manejo Perioperatorio", url: "https://drive.google.com/file/d/16pnlA2hGEgfxNNW0RK7Fczekbgyo2poh/view?usp=drive_link" }
];

// ── ADMIN ────────────────────────────────────────────────────────────────     
const ADMIN = { user: "jv", pass: "jv" };

// ── PERMISOS ──────────────────────────────────────────────────────────────────
const PERMISOS_LABELS = {
  subirDocsBase:        "Subir documentos base",
  subirDocsConsulta:    "Subir docs en consulta (recomendaciones)",
  verFuentes:           "Ver fuentes base",
  generarChecklist:     "Generar checklist IA",
  generarRecomendaciones: "Generar recomendaciones IA"
};

// ── API OFICIAL CIMA (AEMPS) A TRAVÉS DE PROXY PROPIO ────────────────────────
// El proxy /api/cima está configurado en vite.config.js (desarrollo)
// y en server.mjs (producción). No se utilizan proxys públicos ni listados inventados.
const CIMA_ENDPOINT = "/api/cima/medicamentos";

const nombreDe = x => typeof x === "string" ? x : (x?.nombre || "");
const textoLista = (valor) => Array.isArray(valor)
  ? valor.map(nombreDe).filter(Boolean).join(", ") || "—"
  : (typeof valor === "string" && valor.trim() ? valor : "—");

async function buscarCIMA(query, signal) {
  const params = new URLSearchParams({ nombre: query.trim(), pagina: "1" });
  const res = await fetch(`${CIMA_ENDPOINT}?${params}`, {
    method: "GET", headers: { Accept: "application/json" }, signal
  });
  if (!res.ok) {
    let upstreamMessage = "";
    try { upstreamMessage = (await res.json())?.error || ""; } catch {}
    if (res.status === 404) {
      throw new Error("HTTP 404: Vercel no encuentra la función /api/cima/medicamentos. Comprueba que la carpeta api/cima esté en la raíz del repositorio y despliega de nuevo.");
    }
    throw new Error(upstreamMessage || `Error de conexión con CIMA: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!data || !Array.isArray(data.resultados)) {
    throw new Error("Respuesta inesperada de la API de CIMA");
  }
  return data.resultados.slice(0, 10).map(m => ({
    nregistro: String(m.nregistro || ""),
    nombre: m.nombre || "",
    principioActivo: textoLista(m.pactivos || m.principiosActivos),
    atc: Array.isArray(m.atcs) ? m.atcs.map(x => x.codigo || x.nombre).filter(Boolean).join(", ") || "—" : textoLista(m.atc || []),
    formaFarmaceutica: nombreDe(m.formaFarmaceutica) || "—",
    dosis: m.dosis || "—",
    presentaciones: textoLista(m.presentaciones)
  })).filter(m => m.nregistro && m.nombre);
}

const CHECKLIST_ITEMS = [
  {id:1,  cat:"Preparación",        text:"Revisar historia clínica y antecedentes del paciente"},
  {id:2,  cat:"Preparación",        text:"Obtener listado completo de medicación domiciliaria (al menos 2 fuentes)"},
  {id:3,  cat:"Preparación",        text:"Entrevistar al paciente y/o cuidador principal"},
  {id:4,  cat:"Preparación",        text:"Revisar informes de ingresos previos y atención primaria"},
  {id:5,  cat:"Revisión clínica",   text:"Comprobar alergias e intolerancias medicamentosas"},
  {id:6,  cat:"Revisión clínica",   text:"Identificar duplicidades terapéuticas"},
  {id:7,  cat:"Revisión clínica",   text:"Detectar interacciones farmacológicas relevantes"},
  {id:8,  cat:"Revisión clínica",   text:"Valorar adecuación de dosis según función renal y hepática"},
  {id:9,  cat:"Revisión clínica",   text:"Evaluar vía de administración según estado del paciente"},
  {id:10, cat:"Revisión clínica",   text:"Revisar fármacos con margen terapéutico estrecho"},
  {id:11, cat:"Intervención",       text:"Documentar discrepancias justificadas e injustificadas"},
  {id:12, cat:"Intervención",       text:"Comunicar cambios al médico responsable"},
  {id:13, cat:"Intervención",       text:"Actualizar prescripción activa en el sistema"},
  {id:14, cat:"Alta / Seguimiento",text:"Elaborar informe de conciliación al alta"},
  {id:15, cat:"Alta / Seguimiento",text:"Informar al paciente y/o cuidador de los cambios realizados"},
  {id:16, cat:"Alta / Seguimiento",text:"Transmitir información a atención primaria"},
];

const PERFILES = ["General","Quirúrgico","Urgencias","Crítico","Pediatría","Oncología","Geriatría","Nefrología"];

// ── FarmacoSearch ─────────────────────────────────────────────────────────────
function FarmacoSearch({ label, selected, onAdd, onRemove }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [errorSearch, setErrorSearch] = useState("");
  const debounceRef = useRef(null);
  const requestRef = useRef(null);
  const searchIdRef = useRef(0);

  useEffect(() => () => {
    clearTimeout(debounceRef.current);
    requestRef.current?.abort();
  }, []);

  const search = (val) => {
    setQ(val);
    setErrorSearch("");
    clearTimeout(debounceRef.current);
    requestRef.current?.abort();
    const id = ++searchIdRef.current;
    if (val.trim().length < 3) {
      setResults([]); setOpen(false); setLoadingSearch(false); return;
    }
    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      requestRef.current = controller;
      setLoadingSearch(true); setOpen(true);
      try {
        const res = await buscarCIMA(val, controller.signal);
        if (id !== searchIdRef.current) return;
        setResults(res);
        setErrorSearch("");
      } catch (err) {
        if (id !== searchIdRef.current || err.name === "AbortError") return;
        setResults([]);
        setErrorSearch(`⚠️ No se pudo consultar CIMA: ${err.message}`);
      } finally {
        if (id === searchIdRef.current) setLoadingSearch(false);
      }
    }, 400);
  };

  const add = f => {
    if (!selected.find(s => s.nregistro === f.nregistro)) onAdd(f);
    setQ(""); setResults([]); setOpen(false);
  };

  return (
    <div className="mb-4">
      <label className="block text-sm font-semibold text-gray-700 mb-1">{label}</label>
      <div className="relative">
        <input
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Buscar en CIMA (mín. 3 caracteres)..." value={q}
          onChange={e => search(e.target.value)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
        />
        {loadingSearch && <span className="absolute right-3 top-2.5 text-xs text-gray-400">Buscando...</span>}
        {open && (results.length > 0 || errorSearch) && (
          <ul className="absolute z-10 bg-white border border-gray-200 rounded shadow w-full max-h-72 overflow-y-auto text-sm">
            {errorSearch && <li className="px-3 py-2 text-amber-600 text-xs bg-amber-50">{errorSearch}</li>}
            {results.map(f => (
              <li key={f.nregistro} className="px-3 py-2 hover:bg-blue-50 cursor-pointer border-b border-gray-100 last:border-0"
                onMouseDown={() => add(f)}>
                <div className="font-medium text-gray-800 text-xs leading-tight">{f.nombre}</div>
                <div className="text-gray-400 text-xs mt-0.5 flex flex-wrap gap-x-3">
                  {f.principioActivo !== "—" && <span>💊 {f.principioActivo}</span>}
                  {f.atc !== "—" && <span>ATC: {f.atc}</span>}
                  {f.formaFarmaceutica !== "—" && <span>{f.formaFarmaceutica}</span>}
                  {f.dosis !== "—" && <span>{f.dosis}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {selected.map(f => (
          <span key={f.nregistro} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full flex items-center gap-1 max-w-xs"
            title={`PA: ${f.principioActivo} | ATC: ${f.atc} | ${f.formaFarmaceutica} ${f.dosis}`}>
            <span className="truncate">{f.nombre}</span>
            <button onClick={() => onRemove(f.nregistro)} className="text-blue-500 hover:text-red-500 font-bold flex-shrink-0">×</button>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── LOGIN ────────────────────────────────────────────────────────────────     
function LoginScreen({ onLogin, extraUsers }) {
  const [user, setUser] = useState(""); const [pass, setPass] = useState(""); const [err, setErr] = useState("");
  const login = tipo => {
    if (tipo === "invitado") { onLogin({ tipo:"invitado", nombre:"Invitado", permisos:{} }); return; }
    if (user === ADMIN.user && pass === ADMIN.pass) {
      onLogin({ tipo:"admin", nombre:"jv", permisos:{ subirDocsBase:true, subirDocsConsulta:true, verFuentes:true, generarChecklist:true, generarRecomendaciones:true } });
      return;
    }
    const found = extraUsers.find(u => u.user === user && u.pass === pass);
    if (found) { onLogin({ tipo:"usuario", nombre:found.user, permisos:found.permisos }); return; }
    setErr("Usuario o contraseña incorrectos.");
  };
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">🏥</div>
          <h1 className="text-xl font-bold text-blue-900">Conciliación de Medicación</h1>
          <p className="text-xs text-gray-400 mt-1">Herramienta clínica de apoyo farmacoterapéutico</p>
        </div>
        <div className="space-y-3 mb-4">
          <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Usuario" value={user} onChange={e => { setUser(e.target.value); setErr(""); }} />
          <input type="password" className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Contraseña" value={pass} onChange={e => { setPass(e.target.value); setErr(""); }}
            onKeyDown={e => e.key === "Enter" && login("usuario")} />
          {err && <p className="text-xs text-red-500">{err}</p>}
          <button onClick={() => login("usuario")} className="w-full bg-blue-800 hover:bg-blue-900 text-white font-semibold py-2 rounded text-sm transition">Iniciar sesión</button>
        </div>
        <div className="relative text-center my-3">
          <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
          <span className="relative bg-white px-2 text-xs text-gray-400">o</span>
        </div>
        <button onClick={() => login("invitado")} className="w-full border border-gray-300 hover:bg-gray-50 text-gray-600 font-medium py-2 rounded text-sm transition">Continuar como invitado</button>
        <p className="text-xs text-gray-400 text-center mt-4">El acceso como invitado tiene funciones limitadas</p>
      </div>
    </div>
  );
}

// ── PANEL ADMIN ───────────────────────────────────────────────────────────────
function AdminPanel({ extraUsers, setExtraUsers, fuentesExtra, setFuentesExtra, docsExtra, setDocsExtra }) {
  const [adminTab, setAdminTab] = useState("usuarios");
  const [nuevoUser, setNuevoUser] = useState(""); const [nuevoPass, setNuevoPass] = useState("");
  const [permisosTmp, setPermisosTmp] = useState({ subirDocsBase:false, subirDocsConsulta:true, verFuentes:true, generarChecklist:true, generarRecomendaciones:true });
  const [userMsg, setUserMsg] = useState("");
  const [fNombre, setFNombre] = useState(""); const [fUrl, setFUrl] = useState(""); const [fMsg, setFMsg] = useState("");
  const fileRef = useRef();

  const saveUsers = async arr => {
    setExtraUsers(arr);
    try { await window.storage.set("usuarios_extra", JSON.stringify(arr), false); } catch {}
  };

  const crearUsuario = () => {
    if (!nuevoUser.trim() || !nuevoPass.trim()) { setUserMsg("Completa usuario y contraseña."); return; }
    if (nuevoUser === ADMIN.user) { setUserMsg("Nombre reservado."); return; }
    if (extraUsers.find(u => u.user === nuevoUser)) { setUserMsg("El usuario ya existe."); return; }
    const arr = [...extraUsers, { user:nuevoUser.trim(), pass:nuevoPass.trim(), permisos:{...permisosTmp} }];
    saveUsers(arr);
    setNuevoUser(""); setNuevoPass("");
    setPermisosTmp({ subirDocsBase:false, subirDocsConsulta:true, verFuentes:true, generarChecklist:true, generarRecomendaciones:true });
    setUserMsg("✅ Usuario creado correctamente.");
    setTimeout(() => setUserMsg(""), 3000);
  };

  const eliminarUsuario = idx => { const arr = [...extraUsers]; arr.splice(idx, 1); saveUsers(arr); };

  const actualizarPermiso = (idx, perm, val) => {
    const arr = extraUsers.map((u, i) => i === idx ? { ...u, permisos:{ ...u.permisos, [perm]:val } } : u);
    saveUsers(arr);
  };

  const agregarFuente = async () => {
    if (!fNombre.trim() || !fUrl.trim()) { setFMsg("Completa nombre y URL."); return; }
    const arr = [...fuentesExtra, { nombre:fNombre.trim(), url:fUrl.trim() }];
    setFuentesExtra(arr);
    try { await window.storage.set("fuentes_extra", JSON.stringify(arr), false); } catch {}
    setFNombre(""); setFUrl(""); setFMsg("✅ Fuente añadida.");
    setTimeout(() => setFMsg(""), 3000);
  };

  const eliminarFuente = async idx => {
    const arr = fuentesExtra.filter((_, i) => i !== idx);
    setFuentesExtra(arr);
    try { await window.storage.set("fuentes_extra", JSON.stringify(arr), false); } catch {}
  };

  const handleDocFiles = async files => {
    const arr = [...docsExtra];
    for (const f of files) {
      if (f.type === "application/pdf") {
        const b = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(f); });
        arr.push({ nombre:f.name, b64:b });
      }
    }
    setDocsExtra(arr);
    try { await window.storage.set("docs_extra", JSON.stringify(arr), false); } catch {}
  };

  const eliminarDoc = async idx => {
    const arr = docsExtra.filter((_, i) => i !== idx);
    setDocsExtra(arr);
    try { await window.storage.set("docs_extra", JSON.stringify(arr), false); } catch {}
  };

  const aTabs = [{ id:"usuarios", label:"👥 Usuarios" }, { id:"fuentes", label:"📚 Fuentes base" }, { id:"docs", label:"📄 PDFs" }];

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="bg-blue-900 text-white px-6 py-3 flex items-center gap-2">
        <span className="text-lg">⚙️</span>
        <h2 className="font-bold text-base">Panel de Administración</h2>
        <span className="ml-auto text-xs bg-blue-700 px-2 py-0.5 rounded-full">Admin · jv</span>
      </div>
      <div className="flex border-b">
        {aTabs.map(t => (
          <button key={t.id} onClick={() => setAdminTab(t.id)}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition ${adminTab === t.id ? "border-blue-700 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-6">

        {adminTab === "usuarios" && (
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-4">Crear nuevo usuario</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input className="border border-gray-300 rounded px-3 py-2 text-sm" placeholder="Nombre de usuario" value={nuevoUser} onChange={e => setNuevoUser(e.target.value)} />
              <input type="password" className="border border-gray-300 rounded px-3 py-2 text-sm" placeholder="Contraseña" value={nuevoPass} onChange={e => setNuevoPass(e.target.value)} />
            </div>
            <div className="bg-gray-50 rounded p-3 mb-3">
              <p className="text-xs font-semibold text-gray-600 mb-2">Permisos:</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(PERMISOS_LABELS).map(([k, lbl]) => (
                  <label key={k} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" className="accent-blue-700" checked={!!permisosTmp[k]} onChange={e => setPermisosTmp(p => ({ ...p, [k]:e.target.checked }))} />
                    {lbl}
                  </label>
                ))}
              </div>
            </div>
            {userMsg && <p className="text-xs mb-2 text-green-600">{userMsg}</p>}
            <button onClick={crearUsuario} className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-semibold px-4 py-2 rounded transition">+ Crear usuario</button>
            {extraUsers.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-bold text-gray-700 mb-3">Usuarios creados ({extraUsers.length})</h3>
                <div className="space-y-3">
                  {extraUsers.map((u, i) => (
                    <div key={i} className="border border-gray-200 rounded p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-gray-800">👤 {u.user}</span>
                        <button onClick={() => eliminarUsuario(i)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                      </div>
                      <div className="grid grid-cols-2 gap-1">
                        {Object.entries(PERMISOS_LABELS).map(([k, lbl]) => (
                          <label key={k} className="flex items-center gap-2 text-xs cursor-pointer">
                            <input type="checkbox" className="accent-blue-700" checked={!!u.permisos[k]} onChange={e => actualizarPermiso(i, k, e.target.checked)} />
                            {lbl}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {adminTab === "fuentes" && (
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-1">Fuentes base hardcoded (permanentes)</h3>
            <ul className="mb-5 space-y-2">
              {FUENTES_HARDCODED.map((f, i) => (
                <li key={i} className="flex items-center justify-between bg-green-50 border border-green-200 rounded px-3 py-2 text-sm">
                  <span className="text-green-800 font-medium">📄 {f.nombre}</span>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Ver →</a>
                </li>
              ))}
            </ul>
            <h3 className="text-sm font-bold text-gray-700 mb-3">Añadir nueva fuente (enlace Drive/web)</h3>
            <div className="space-y-2 mb-3">
              <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="Nombre del documento" value={fNombre} onChange={e => setFNombre(e.target.value)} />
              <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="URL (Google Drive u otro)" value={fUrl} onChange={e => setFUrl(e.target.value)} />
            </div>
            {fMsg && <p className="text-xs mb-2 text-green-600">{fMsg}</p>}
            <button onClick={agregarFuente} className="bg-blue-800 hover:bg-blue-900 text-white text-sm font-semibold px-4 py-2 rounded transition">+ Añadir fuente</button>
            {fuentesExtra.length > 0 && (
              <div className="mt-5">
                <h3 className="text-sm font-bold text-gray-700 mb-2">Fuentes añadidas ({fuentesExtra.length})</h3>
                <ul className="space-y-2">
                  {fuentesExtra.map((f, i) => (
                    <li key={i} className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded px-3 py-2 text-sm">
                      <span className="text-blue-800">📄 {f.nombre}</span>
                      <div className="flex items-center gap-3">
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Ver →</a>
                        <button onClick={() => eliminarFuente(i)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {adminTab === "docs" && (
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-1">PDFs cargados</h3>
            <p className="text-xs text-gray-500 mb-3">Estos PDFs se envían a la IA en cada consulta como contexto completo.</p>
            <div className="border-2 border-dashed border-blue-300 rounded-lg p-6 text-center cursor-pointer hover:bg-blue-50 transition"
              onClick={() => fileRef.current.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); handleDocFiles([...e.dataTransfer.files]); }}>
              <div className="text-3xl mb-1">📄</div>
              <p className="text-sm text-gray-500">Haz clic o arrastra PDFs aquí</p>
              <input ref={fileRef} type="file" accept=".pdf" multiple className="hidden" onChange={e => handleDocFiles([...e.target.files])} />
            </div>
            {docsExtra.length > 0 ? (
              <ul className="space-y-2">
                {docsExtra.map((d, i) => (
                  <li key={i} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2 text-sm">
                    <span>📄 {d.nombre}</span>
                    <button onClick={() => eliminarDoc(i)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-gray-400 text-center">No hay PDFs cargados aún.</p>}
          </div>
        )}

      </div>
    </div>
  );
}

// ── APP PRINCIPAL ─────────────────────────────────────────────────────────────
export default function App() {
  const [sesion, setSesion] = useState(null);
  const [extraUsers, setExtraUsers] = useState([]);
  const [fuentesExtra, setFuentesExtra] = useState([]);
  const [docsExtra, setDocsExtra] = useState([]);
  const [loadingStorage, setLoadingStorage] = useState(true);

  useEffect(() => {
    (async () => {
      try { const u = await window.storage.get("usuarios_extra"); if (u) setExtraUsers(JSON.parse(u.value)); } catch {}
      try { const f = await window.storage.get("fuentes_extra");  if (f) setFuentesExtra(JSON.parse(f.value)); } catch {}
      try { const d = await window.storage.get("docs_extra");     if (d) setDocsExtra(JSON.parse(d.value)); } catch {}
      setLoadingStorage(false);
    })();
  }, []);

  const [tab, setTab] = useState("datos");
  const [contexto, setContexto] = useState("ingreso");
  const [viaOral, setViaOral] = useState("si");
  const [analitica, setAnalitica] = useState({ creatinina:"", filtrado:"", sodio:"", potasio:"", alt:"", otro:"" });
  const [farmacosDom, setFarmacosDom] = useState([]);
  const [farmacosHosp, setFarmacosHosp] = useState([]);
  const [checklist, setChecklist] = useState({});
  const [perfil, setPerfil] = useState("General");
  const [checklistIA, setChecklistIA] = useState("");
  const [loadingCL, setLoadingCL] = useState(false);
  const [consultaDocs, setConsultaDocs] = useState([]);
  const [consultaDocsB64, setConsultaDocsB64] = useState([]);
  const [recomendacion, setRecomendacion] = useState("");
  const [loading, setLoading] = useState(false);
  const consultaFileRef = useRef();

  if (loadingStorage) return <div className="min-h-screen flex items-center justify-center text-blue-800 text-sm">Cargando...</div>;
  if (!sesion) return <LoginScreen onLogin={setSesion} extraUsers={extraUsers} />;

  const isAdmin = sesion.tipo === "admin";
  const perm = k => isAdmin || !!sesion.permisos?.[k];

  const todasFuentes = [...FUENTES_HARDCODED, ...fuentesExtra];
  const todosDocs = [...docsExtra];

  const farmacoToText = f =>
    `${f.nombre} (PA: ${f.principioActivo}; ATC: ${f.atc}; Forma: ${f.formaFarmaceutica}; Dosis: ${f.dosis})`;

  const fuentesCtx = () => {
    const base = todasFuentes.map(f => `- ${f.nombre} (${f.url})`).join("\n");
    const extra = consultaDocs.length ? `\nDocumentos adicionales de consulta: ${consultaDocs.join(", ")}` : "";
    return `FUENTES DE REFERENCIA CLÍNICA (basa SIEMPRE tus recomendaciones en estas guías):\n${base}${extra}`;
  };

  const buildContent = prompt => [
    ...todosDocs.map(d => ({ type:"document", source:{ type:"base64", media_type:"application/pdf", data:d.b64 }, title:d.nombre })),
    ...consultaDocsB64.map((b, i) => ({ type:"document", source:{ type:"base64", media_type:"application/pdf", data:b }, title:consultaDocs[i] || "Doc consulta" })),
    { type:"text", text:`${fuentesCtx()}\n\n${prompt}` }
  ];

  const callAI = async (prompt, sys) => {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:1000, system:sys, messages:[{ role:"user", content:buildContent(prompt) }] })
    });
    const d = await r.json();
    return d.content?.map(b => b.text || "").join("\n") || "Sin respuesta.";
  };

  const generateRec = async () => {
    if (!perm("generarRecomendaciones")) return;
    setLoading(true); setRecomendacion(""); setTab("recomendaciones");
    const analText = Object.entries(analitica).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", ");
    try {
      const txt = await callAI(
        `CONTEXTO: ${contexto === "ingreso" ? "Ingreso hospitalario" : "Alta hospitalaria"}
VÍA ORAL: ${viaOral === "si" ? "Tolera vía oral" : "NO tolera vía oral"}
ANALÍTICA: ${analText || "No aportada"}
MEDICACIÓN DOMICILIARIA: ${farmacosDom.length ? farmacosDom.map(farmacoToText).join("\n  - ") : "No especificada"}
MEDICACIÓN HOSPITALARIA: ${farmacosHosp.length ? farmacosHosp.map(farmacoToText).join("\n  - ") : "No especificada"}

Genera informe de conciliación estructurado:
1. **RESUMEN DEL CASO**
2. **FÁRMACOS A MANTENER**
3. **FÁRMACOS A SUSPENDER O AJUSTAR**
4. **FÁRMACOS A REINTRODUCIR**
5. **FÁRMACOS A VIGILAR**
6. **CONSIDERACIONES ESPECIALES**
7. **RECOMENDACIONES ADICIONALES**
Cita las guías de referencia cuando aplique.`,
        "Eres farmacéutico clínico experto en conciliación hospitalaria. Basa tus recomendaciones en las guías indicadas. Español clínico profesional."
      );
      setRecomendacion(txt);
    } catch { setRecomendacion("Error al conectar con la IA."); }
    setLoading(false);
  };

  const generateChecklist = async () => {
    if (!perm("generarChecklist")) return;
    setLoadingCL(true); setChecklistIA("");
    try {
      const txt = await callAI(
        `Perfil: ${perfil}\n\nGenera checklist personalizada:\n**PERFIL: ${perfil.toUpperCase()}**\n**PUNTOS CLAVE DE SEGURIDAD**\n- [punto]\n**MEDICACIÓN DE ALTO RIESGO A REVISAR**\n- [fármaco]: [motivo]\n**ACCIONES ESPECÍFICAS DE TRANSICIÓN ASISTENCIAL**\n- [acción]\nSin introducciones. Terminología clínica precisa.`,
        "Eres experto en conciliación de medicación. Checklists clínicas precisas basadas en las guías indicadas. Sin introducciones. Español."
      );
      setChecklistIA(txt);
    } catch { setChecklistIA("Error al conectar con la IA."); }
    setLoadingCL(false);
  };

  const handleConsultaFiles = async files => {
    const nd = [...consultaDocs], nb = [...consultaDocsB64];
    for (const f of files) {
      if (f.type === "application/pdf") {
        const b = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(f); });
        nd.push(f.name); nb.push(b);
      }
    }
    setConsultaDocs(nd); setConsultaDocsB64(nb);
  };

  const formatRec = txt => txt.split("\n").map((line, i) => {
    if (/^\*\*.*\*\*$/.test(line.trim())) return <h3 key={i} className="font-bold text-blue-900 mt-4 mb-1 text-base">{line.replace(/\*\*/g, "")}</h3>;
    if (/\*\*.*\*\*/.test(line)) return <p key={i} className="text-sm mb-1" dangerouslySetInnerHTML={{ __html:line.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />;
    if (line.startsWith("- ") || line.startsWith("• ")) return <li key={i} className="text-sm ml-4 mb-0.5 list-disc">{line.slice(2)}</li>;
    if (/^\d+\./.test(line)) return <p key={i} className="font-semibold text-gray-800 mt-3 mb-1 text-sm">{line}</p>;
    return line ? <p key={i} className="text-sm mb-1">{line}</p> : <br key={i} />;
  });

  const cats = [...new Set(CHECKLIST_ITEMS.map(i => i.cat))];
  const mainTabs = [
    { id:"datos",           label:"📋 Datos" },
    { id:"farmacos",        label:"💊 Fármacos" },
    { id:"checklist",       label:"✅ Checklist" },
    { id:"documentos",      label:"📄 Documentos" },
    { id:"recomendaciones", label:"🤖 Recomendaciones IA" },
    ...(isAdmin ? [{ id:"admin", label:"⚙️ Admin" }] : []),
  ];

  return (
    <div className="min-h-screen bg-gray-50 font-sans">

      {/* Header */}
      <div className="bg-blue-900 text-white px-6 py-4 shadow flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">🏥 Conciliación de Medicación</h1>
          <p className="text-blue-200 text-xs mt-0.5">Herramienta clínica de apoyo farmacoterapéutico</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs bg-blue-700 px-2 py-1 rounded-full">
            {isAdmin ? "👑 Admin · jv" : sesion.tipo === "invitado" ? "👥 Invitado" : `👤 ${sesion.nombre}`}
          </span>
          <button onClick={() => setSesion(null)} className="text-xs bg-blue-700 hover:bg-blue-600 px-3 py-1 rounded transition">Salir</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-4 flex overflow-x-auto">
        {mainTabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === t.id ? "border-blue-700 text-blue-700" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* DATOS */}
        {tab === "datos" && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Datos del paciente</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Contexto clínico</label>
                <select className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={contexto} onChange={e => setContexto(e.target.value)}>
                  <option value="ingreso">Ingreso hospitalario</option>
                  <option value="alta">Alta hospitalaria</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tolerancia vía oral</label>
                <select className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={viaOral} onChange={e => setViaOral(e.target.value)}>
                  <option value="si">Tolera vía oral</option>
                  <option value="no">No tolera vía oral</option>
                </select>
              </div>
            </div>
            <h3 className="text-sm font-bold text-gray-700 mb-3 mt-4">Analítica</h3>
            <div className="grid grid-cols-2 gap-3">
              {[["creatinina","Creatinina (mg/dL)"],["filtrado","FG (mL/min)"],["sodio","Sodio (mEq/L)"],["potasio","Potasio (mEq/L)"],["alt","ALT/GOT (U/L)"],["otro","Otros datos relevantes"]].map(([k, lbl]) => (
                <div key={k}>
                  <label className="block text-xs text-gray-500 mb-1">{lbl}</label>
                  <input className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" placeholder={lbl} value={analitica[k]} onChange={e => setAnalitica(p => ({ ...p, [k]:e.target.value }))} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* FÁRMACOS */}
        {tab === "farmacos" && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Medicación</h2>
            <FarmacoSearch label="💊 Medicación domiciliaria" selected={farmacosDom}
              onAdd={f => setFarmacosDom(p => [...p, f])} onRemove={nr => setFarmacosDom(p => p.filter(x => x.nregistro !== nr))} />
            <hr className="my-4" />
            <FarmacoSearch label="🏥 Medicación hospitalaria" selected={farmacosHosp}
              onAdd={f => setFarmacosHosp(p => [...p, f])} onRemove={nr => setFarmacosHosp(p => p.filter(x => x.nregistro !== nr))} />
          </div>
        )}

        {/* CHECKLIST */}
        {tab === "checklist" && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-1">Checklist de intervenciones</h2>
            <p className="text-xs text-gray-500 mb-4">Marca las intervenciones completadas.</p>
            {cats.map(cat => (
              <div key={cat} className="mb-5">
                <h3 className="text-xs font-bold text-blue-800 uppercase tracking-wider mb-2 border-b pb-1">{cat}</h3>
                {CHECKLIST_ITEMS.filter(i => i.cat === cat).map(item => (
                  <label key={item.id} className={`flex items-start gap-3 py-2 px-2 rounded cursor-pointer hover:bg-gray-50 ${checklist[item.id] ? "opacity-60" : ""}`}>
                    <input type="checkbox" className="mt-0.5 accent-blue-700" checked={!!checklist[item.id]} onChange={() => setChecklist(p => ({ ...p, [item.id]:!p[item.id] }))} />
                    <span className={`text-sm ${checklist[item.id] ? "line-through text-gray-400" : "text-gray-700"}`}>{item.text}</span>
                  </label>
                ))}
              </div>
            ))}
            <div className="mt-2 bg-blue-50 rounded px-4 py-2 text-sm text-blue-800 font-medium">
              {Object.values(checklist).filter(Boolean).length} / {CHECKLIST_ITEMS.length} completadas
            </div>
            <div className="mt-8 border-t pt-6">
              <h3 className="text-base font-bold text-gray-800 mb-1">Checklist personalizada por perfil</h3>
              <p className="text-xs text-gray-500 mb-3">La IA generará una checklist específica basada en las guías activas y el perfil seleccionado.</p>
              <div className="flex flex-wrap gap-2 mb-4">
                {PERFILES.map(p => (
                  <button key={p} onClick={() => setPerfil(p)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${perfil === p ? "bg-blue-800 text-white border-blue-800" : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"}`}>
                    {p}
                  </button>
                ))}
              </div>
              {perm("generarChecklist") ? (
                <button onClick={generateChecklist} disabled={loadingCL}
                  className="w-full bg-blue-700 hover:bg-blue-900 disabled:bg-gray-300 text-white font-semibold py-2 rounded text-sm transition mb-4">
                  {loadingCL ? "⏳ Generando..." : `🤖 Generar checklist — ${perfil}`}
                </button>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded px-4 py-3 text-center text-xs text-amber-700 mb-4">🔒 Sin permiso para generar checklist IA</div>
              )}
              {loadingCL && <div className="flex items-center justify-center py-4 text-blue-700 text-sm gap-2"><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Analizando...</div>}
              {checklistIA && !loadingCL && (
                <div className="bg-blue-50 border border-blue-200 rounded p-4">
                  <div className="text-xs font-bold text-blue-700 uppercase mb-3">Checklist — {perfil}</div>
                  <div>{formatRec(checklistIA)}</div>
                  <p className="text-xs text-gray-400 mt-3 border-t pt-2">⚠️ Validar con criterios institucionales vigentes.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* DOCUMENTOS */}
        {tab === "documentos" && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Documentación clínica</h2>
            {perm("verFuentes") && (
              <div className="mb-6">
                <h3 className="text-sm font-bold text-gray-700 mb-2">📚 Fuentes activas ({todasFuentes.length + todosDocs.length})</h3>
                <ul className="space-y-2 mb-2">
                  {todasFuentes.map((f, i) => (
                    <li key={i} className="flex items-center justify-between bg-green-50 border border-green-200 rounded px-3 py-2 text-sm">
                      <span className="text-green-800 font-medium">📄 {f.nombre}</span>
                      <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">Ver →</a>
                    </li>
                  ))}
                  {todosDocs.map((d, i) => (
                    <li key={"d" + i} className="flex items-center bg-blue-50 border border-blue-200 rounded px-3 py-2 text-sm">
                      <span className="text-blue-800 font-medium">📄 {d.nombre} <span className="text-xs text-blue-400">(PDF)</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <hr className="mb-5" />
            {perm("subirDocsBase") ? (
              <div>
                <h3 className="text-sm font-bold text-gray-700 mb-1">⬆️ Subir documentos base</h3>
                <p className="text-xs text-gray-500 mb-3">Documentos permanentes. Para añadir fuentes persistentes usa el Panel Admin.</p>
                <div className="border-2 border-dashed border-blue-300 rounded-lg p-6 text-center cursor-pointer hover:bg-blue-50 transition"
                  onClick={() => consultaFileRef.current.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleConsultaFiles([...e.dataTransfer.files]); }}>
                  <div className="text-3xl mb-1">📄</div>
                  <p className="text-sm text-gray-500">Haz clic o arrastra PDFs aquí</p>
                  <input ref={consultaFileRef} type="file" accept=".pdf" multiple className="hidden" onChange={e => handleConsultaFiles([...e.target.files])} />
                </div>
                {consultaDocs.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {consultaDocs.map((d, i) => (
                      <li key={i} className="flex items-center justify-between bg-gray-50 rounded px-3 py-2 text-sm">
                        <span>📄 {d}</span>
                        <button onClick={() => { setConsultaDocs(p => p.filter((_, j) => j !== i)); setConsultaDocsB64(p => p.filter((_, j) => j !== i)); }} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-4 text-center">
                <div className="text-2xl mb-1">🔒</div>
                <p className="text-sm text-amber-800 font-medium">Acceso restringido</p>
                <p className="text-xs text-amber-600 mt-1">La subida de documentos no está habilitada para este usuario.</p>
              </div>
            )}
          </div>
        )}

        {/* RECOMENDACIONES */}
        {tab === "recomendaciones" && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-1">Recomendaciones de la IA</h2>
            <p className="text-xs text-gray-500 mb-3">Basadas en los datos y las guías clínicas activas.</p>
            <div className="bg-gray-50 rounded p-3 text-xs text-gray-600 mb-4 space-y-1">
              <div><span className="font-semibold">Contexto:</span> {contexto === "ingreso" ? "Ingreso" : "Alta"} · Vía oral: {viaOral === "si" ? "Sí" : "No"}</div>
              <div><span className="font-semibold">Med. domiciliaria:</span> {farmacosDom.length ? farmacosDom.map(f => f.nombre).join(", ") : "—"}</div>
              <div><span className="font-semibold">Med. hospitalaria:</span> {farmacosHosp.length ? farmacosHosp.map(f => f.nombre).join(", ") : "—"}</div>
              <div><span className="font-semibold">Fuentes activas:</span> {todasFuentes.map(f => f.nombre).concat(todosDocs.map(d => d.nombre)).join(", ") || "—"}</div>
              {consultaDocs.length > 0 && <div><span className="font-semibold">Docs de consulta:</span> {consultaDocs.join(", ")}</div>}
            </div>

            {perm("subirDocsConsulta") && (
              <div className="mb-4 border border-blue-100 rounded-lg p-3 bg-blue-50">
                <h3 className="text-xs font-bold text-blue-800 mb-1">📎 Añadir guía específica <span className="font-normal text-blue-500">(opcional)</span></h3>
                <p className="text-xs text-blue-600 mb-2">Si lo deseas, sube una guía de patología o protocolo concreto para enriquecer esta recomendación. No es necesario para generar el informe.</p>
                <div className="border border-dashed border-blue-300 rounded p-3 text-center cursor-pointer hover:bg-blue-100 transition"
                  onClick={() => consultaFileRef.current.click()}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleConsultaFiles([...e.dataTransfer.files]); }}>
                  <p className="text-xs text-blue-500">📄 Haz clic o arrastra un PDF aquí</p>
                  <input ref={consultaFileRef} type="file" accept=".pdf" multiple className="hidden" onChange={e => handleConsultaFiles([...e.target.files])} />
                </div>
                {consultaDocs.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {consultaDocs.map((d, i) => (
                      <li key={i} className="flex items-center justify-between bg-white rounded px-2 py-1 text-xs">
                        <span>📄 {d}</span>
                        <button onClick={() => { setConsultaDocs(p => p.filter((_, j) => j !== i)); setConsultaDocsB64(p => p.filter((_, j) => j !== i)); }} className="text-red-400 hover:text-red-600">×</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {perm("generarRecomendaciones") ? (
              <button onClick={generateRec} disabled={loading || (!farmacosDom.length && !farmacosHosp.length)}
                className="w-full bg-blue-800 hover:bg-blue-900 disabled:bg-gray-300 text-white font-semibold py-2.5 rounded text-sm transition mb-4">
                {loading ? "⏳ Analizando..." : "🤖 Generar recomendaciones"}
              </button>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded px-4 py-3 text-center text-xs text-amber-700 mb-4">🔒 Sin permiso para generar recomendaciones IA</div>
            )}
            {(!farmacosDom.length && !farmacosHosp.length) && !recomendacion && perm("generarRecomendaciones") && (
              <p className="text-xs text-amber-600 text-center">Añade al menos un fármaco en la pestaña de Fármacos.</p>
            )}
            {loading && <div className="flex items-center justify-center py-8 text-blue-700 text-sm gap-2"><svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Consultando guías y analizando medicación...</div>}
            {recomendacion && !loading && (
              <div className="bg-blue-50 border border-blue-200 rounded p-4 text-gray-800">
                <div className="text-xs font-bold text-blue-700 uppercase mb-3">Informe de conciliación</div>
                <div>{formatRec(recomendacion)}</div>
                <p className="text-xs text-gray-400 mt-4 border-t pt-2">⚠️ Herramienta de apoyo clínico. Validar con profesional sanitario cualificado.</p>
              </div>
            )}
          </div>
        )}

        {/* ADMIN */}
        {tab === "admin" && isAdmin && (
          <AdminPanel
            extraUsers={extraUsers} setExtraUsers={setExtraUsers}
            fuentesExtra={fuentesExtra} setFuentesExtra={setFuentesExtra}
            docsExtra={docsExtra} setDocsExtra={setDocsExtra}
          />
        )}

        {tab !== "recomendaciones" && tab !== "admin" && perm("generarRecomendaciones") && (
          <div className="mt-4 text-right">
            <button onClick={generateRec} disabled={!farmacosDom.length && !farmacosHosp.length}
              className="bg-blue-800 hover:bg-blue-900 disabled:bg-gray-300 text-white text-sm font-semibold px-5 py-2 rounded transition">
              🤖 Generar recomendaciones IA
            </button>
          </div>
        )}

      </div>
    </div>
  );
}