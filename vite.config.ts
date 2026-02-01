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
            // Proxy API and management endpoints
            '/webhooks': 'http://localhost:4000',
            '/hooks': 'http://localhost:4000',
            '/meta': 'http://localhost:4000',
            '/health': 'http://localhost:4000',
            // Proxy webhook deliveries (POST requests to any slug)
            // We use a custom filter to ensure we only proxy what's needed
            '^/(?!src|node_modules|@vite|@fs|js|styles|favicon.ico).*': {
                target: 'http://localhost:4000',
                changeOrigin: true,
                bypass: (req) => {
                    // If it's a GET request and doesn't have an extension, it's likely a page route
                    // Let Vite handle it for SPA routing
                    if (req.method === 'GET' && !req.url?.includes('.')) {
                        return '/index.html';
                    }
                    return null;
                },
            },
        },
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, 'public/js'),
        },
    },
});
