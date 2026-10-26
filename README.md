# Conciliación de medicación — estilo Claude y CIMA real

Proyecto Vite + React + Tailwind CSS v3. Mantiene la interfaz original de Claude y la función de Vercel `api/cima/medicamentos.js`.

## Instalación en GitHub / Vercel

1. Descomprime y coloca **el contenido** de esta carpeta en la raíz del repositorio (donde está `package.json`). No subas una carpeta adicional contenedora.
2. En GitHub, conserva `api/cima/medicamentos.js` en raíz. Sustituye/añade `package.json`, `postcss.config.js`, `tailwind.config.js`, `src/App.jsx`, `src/main.jsx`, `src/style.css`, `index.html`, `vite.config.js`.
3. En Vercel: Framework Vite, Build Command `npm run build`, Output Directory `dist`, Root Directory `./`.
4. Si hay `package-lock.json` anterior, regénéralo mediante `npm install` y súbelo; Vercel instalará las dependencias según `package.json`.
5. Haz commit y espera el redeploy. Comprueba búsqueda de medicamentos y estilos azules.

**Qué se corrige**: los estilos de Claude usan clases Tailwind (`bg-blue-900`, `rounded-lg`, etc.). Si Tailwind no se configura, el navegador ignora esas clases y el diseño queda plano. Este proyecto incluye Tailwind 3, PostCSS y su hoja de entrada.

**Limitaciones originales conservadas**: `window.storage` no ofrece persistencia web convencional; llamada IA de Anthropic original sin credenciales reales. No cargar datos de pacientes identificables sin proteger acceso, backend y tratamiento de datos.
