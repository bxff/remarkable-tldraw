import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: [
            { find: /^@rmscene\/(.*)/, replacement: path.resolve(__dirname, '../rmscene/src/ts/$1') },
            { find: /^@rmc\/(.*)/, replacement: path.resolve(__dirname, '../rmc/src/ts/$1') },
        ],
    },
})
