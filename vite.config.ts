/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

/** 배포마다 바뀌는 빌드 ID — 플레이 중인 화면이 새 버전을 알아챌 수 있게 version.json 으로도 내보냄 */
const BUILD_ID = Date.now().toString(36);
const versionFile = () => ({
  name: 'haetsal-version-file',
  apply: 'build' as const,
  generateBundle(this: { emitFile: (f: { type: 'asset'; fileName: string; source: string }) => void }) {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
  },
});

export default defineConfig({
  plugins: [react(), tailwindcss(), versionFile()],
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/phaser')) return 'phaser';
          if (id.includes('node_modules/@supabase')) return 'supabase';
          return undefined;
        },
      },
    },
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
});
