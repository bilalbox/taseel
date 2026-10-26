import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: "تأصيل (Ta'seel) | محرك القواعد الفقهية والأصولية لفتاوى نور على الدرب",
        short_name: "تأصيل | Ta'seel",
        description:
          'محرك بحث واختبار تفاعلي للقواعد الفقهية والأصولية والضوابط المستنبطة من أرشيف نور على الدرب للشيخين ابن باز وابن عثيمين (يعمل 100% دون اتصال عبر SQLite WASM + OPFS)',
        theme_color: '#0F5C5C',
        background_color: '#F7F6F3',
        display: 'standalone',
        dir: 'rtl',
        lang: 'ar'
      },
      workbox: {
        // content.sqlite3.gz is persisted directly in OPFS via manifest.json
        globIgnores: ['**/content.sqlite3*', '**/*.gz'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      }
    })
  ],
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm']
  },
  worker: {
    format: 'es'
  },
  server: {
    port: 3000,
    host: true
  }
});
