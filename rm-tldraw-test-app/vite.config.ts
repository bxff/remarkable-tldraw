import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@rmscene': path.resolve(__dirname, '../rmscene/src/ts'),
      '@rmc': path.resolve(__dirname, '../rmc/src/ts'),
    },
  },
})
