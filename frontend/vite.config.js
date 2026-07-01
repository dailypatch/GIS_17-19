import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // 本地 FastAPI 后端 (端口 8000)，不可用时自动读取本地 JSON 文件
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
