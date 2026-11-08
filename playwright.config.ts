import { defineConfig } from '@playwright/test';
const publicBaseURL=process.env.PLAYWRIGHT_BASE_URL;
const localBaseURL='http://127.0.0.1:4173/junkyard-drivers/';
export default defineConfig({
  testDir:'./tests/browser', timeout:420_000, expect:{timeout:10000}, workers:1,
  reporter:'list',
  use:{ actionTimeout:15000, navigationTimeout:30000, baseURL:publicBaseURL||localBaseURL, viewport:process.env.CI?{width:960,height:600}:{width:1440,height:900},
    launchOptions:{args:process.platform==='darwin'?['--use-angle=metal']:[],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined},
    screenshot:'only-on-failure', trace:'retain-on-failure',
  },
  ...(publicBaseURL?{}:{webServer:{command:'VITE_BASE_PATH=/junkyard-drivers/ npm run build && VITE_BASE_PATH=/junkyard-drivers/ npm run preview -- --host 127.0.0.1 --port 4173',url:localBaseURL,reuseExistingServer:!process.env.CI,timeout:120000}}),
});
