import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [react(), tailwindcss(), VitePWA({
    registerType: 'prompt', includeAssets: ['npg-logo.png','icons/partcast-192.png','icons/partcast-512.png'],
    manifest: {
      name: 'PartCast · NPG Autoparts', short_name: 'PartCast', description: 'Your parts, stock movements and demand planning in one place.',
      theme_color: '#b91c1c', background_color: '#f8fafc', display: 'standalone', start_url: '/', scope: '/',
      icons: [{src:'/icons/partcast-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:'/icons/partcast-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]
    },
    workbox: {globPatterns: ['**/*.{js,css,html,png,woff2}'],navigateFallbackDenylist: [/^\/api\//,/^\/jobs\//,/^\/setup\//],cleanupOutdatedCaches:true}
  })], server: { port: 5173 }
});
