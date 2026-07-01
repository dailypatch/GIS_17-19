import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // 后端同学电脑 (如果后端在本机则改为 http://127.0.0.1:8000)
        target: 'http://10.180.103.240:8000',
        changeOrigin: true,
      },
    },
  },
})
