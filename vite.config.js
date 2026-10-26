import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const cimaProxy = {
  "/api/cima": {
    target: "https://cima.aemps.es",
    changeOrigin: true,
    secure: true,
    rewrite: path => path.replace(/^\/api\/cima/, "/cima/rest")
  }
};

export default defineConfig({
  plugins: [react()],
  server: { proxy: cimaProxy },
  preview: { proxy: cimaProxy }
});
