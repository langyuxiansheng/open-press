import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const resolvePackage = (name: string) =>
  fileURLToPath(new URL(`../../packages/${name}/src/index.ts`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@open-press/core': resolvePackage('core'),
      '@open-press/renderer': resolvePackage('renderer'),
      '@open-press/designer-core': resolvePackage('designer-core'),
      '@open-press/react': resolvePackage('react')
    }
  }
});
