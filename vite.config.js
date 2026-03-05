import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"

export default defineConfig({
  optimizeDeps: {
    include: ["xlsx"],
  },
  build: {
    commonjsOptions: {
      include: [/xlsx/, /node_modules/],
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "ライフプランPro v5.0",
        short_name: "ライフプランPro",
        description: "家族のライフプランをシミュレーション",
        theme_color: "#1A2332",
        background_color: "#1A2332",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"]
      }
    })
  ]
})
