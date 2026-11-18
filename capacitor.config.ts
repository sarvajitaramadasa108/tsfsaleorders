import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'org.hkmvizag.tsfsaleorders',
  appName: 'TSF Sales Orders',
  webDir: 'public',
  server: { url: 'https://tsfsaleorders.vercel.app', cleartext: false },
};

export default config;
