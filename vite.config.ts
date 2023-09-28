import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import mkcert from 'vite-plugin-mkcert'

// https://vitejs.dev/config/
export default defineConfig({
  base: '/chess',
  plugins: [
    react(),
    mkcert(),
    {
      name: "configure-response-headers",
      configureServer: (server) => {
        server.middlewares.use((_req, res, next) => {
          // res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
          res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
          next();
        });
      },
    },
  ],
  build: {
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          let extType = assetInfo.name.split('.').at(1);
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(extType)) {
            extType = 'img';
          }
          return `chess/static/[name][extname]`;
        },
        chunkFileNames: 'chess/static/[name].js',
        entryFileNames: 'chess/static/[name].js',
      }
    }

  },
  server: {
    https: false,
    proxy: {
      "/encryptor": {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      "/qns-indexer/node": {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
      "/chess/games": {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
