import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // 防止 pixi.js 重复实例（pixi-live2d-display 已知问题）
  resolve: {
    dedupe: ["pixi.js"],
  },
  server: {
    port: 5173,
    // 开发环境代理：把 /api 请求转发到后端，避免跨域问题
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
