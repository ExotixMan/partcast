import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'./tests/e2e',workers:1,timeout:45000,
 use:{baseURL:'http://localhost:4173',headless:true,launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||'/usr/bin/chromium',args:['--no-sandbox']},serviceWorkers:'allow'},
 webServer:{command:'npm run preview -- --port 4173 --strictPort',url:'http://localhost:4173',reuseExistingServer:false},
 reporter:'list'
});
