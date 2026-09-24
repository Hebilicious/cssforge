import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import cssforge from '@hebilicious/cssforge-unplugin/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [cssforge(), react()],
})
