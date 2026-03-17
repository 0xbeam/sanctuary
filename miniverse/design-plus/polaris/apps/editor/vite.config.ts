import { copyFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { defineConfig } from "vite"
import vue from "@vitejs/plugin-vue"
import tailwindcss from "@tailwindcss/vite"
import Icons from "unplugin-icons/vite"
import IconsResolver from "unplugin-icons/resolver"
import Components from "unplugin-vue-components/vite"

function ensureCanvasKitWasm() {
  const src = resolve(__dirname, "node_modules/canvaskit-wasm/bin/canvaskit.wasm")
  const dest = resolve(__dirname, "public/canvaskit.wasm")
  if (existsSync(src) && !existsSync(dest)) {
    copyFileSync(src, dest)
  }
}

ensureCanvasKitWasm()

export default defineConfig({
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      mermaid: resolve(__dirname, "src/shims/mermaid.ts"),
      "beautiful-mermaid": resolve(__dirname, "src/shims/mermaid.ts"),
      "canvaskit-wasm/full": resolve(__dirname, "src/shims/canvaskit-wasm-full.ts"),
      "canvaskit-wasm": resolve(__dirname, "src/shims/canvaskit-wasm.ts"),
      svgpath: resolve(__dirname, "src/shims/svgpath.ts")
    }
  },
  plugins: [
    {
      name: "copy-canvaskit-wasm",
      buildStart() {
        ensureCanvasKitWasm()
      }
    },
    tailwindcss(),
    Icons({ compiler: "vue3" }),
    Components({ resolvers: [IconsResolver({ prefix: "icon" })] }),
    vue()
  ],
  optimizeDeps: {
    exclude: ["@open-pencil/core"]
  },
  server: {
    host: "127.0.0.1",
    port: 3300,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:3200"
    }
  }
})
