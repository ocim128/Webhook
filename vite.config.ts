import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
    root: './public',
    base: '/',
    build: {
        outDir: '../public-dist',
        emptyOutDir: true,
        sourcemap: true,
        rollupOptions: {
            input: {
                main: path.resolve(__dirname, 'public/index.html'),
            },
        },
    },
    server: {
        port: 3000,
        proxy: {
            '/webhooks': 'http://localhost:4000',
            '/hooks': 'http://localhost:4000',
            '/meta': 'http://localhost:4000',
            '/health': 'http://localhost:4000',
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'public/js'),
        },
    },
});
