import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    test: {
        include: [
            'rmscene/tests/ts/**/*.test.ts',
            'rmc/tests/ts/**/*.test.ts',
        ],
        globals: true,
    },
    resolve: {
        alias: {
            '@rmscene': path.resolve(__dirname, './rmscene/src/ts'),
            '@rmc': path.resolve(__dirname, './rmc/src/ts'),
        },
    },
});
