// import { defineConfig } from "vite";
// import react from "@vitejs/plugin-react";

// export default defineConfig({ plugins: [react()], server: { allowedHosts: true } });

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/event-accelerator/",
  server: { allowedHosts: true },
});