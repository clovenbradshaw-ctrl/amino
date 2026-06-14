import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

// Project Pages serves at https://<user>.github.io/amino/ — so the build base is
// '/amino/' in CI. When hosting at the firm's own domain (app.aminoimmigration.com)
// at the web root, set AMINO_BASE=/ to override.
export default defineConfig({
  base: process.env.AMINO_BASE || (process.env.GITHUB_ACTIONS ? '/amino/' : '/'),
  plugins: [wasm(), topLevelAwait()],
  build: { target: 'esnext' },
  optimizeDeps: {
    exclude: ['@matrix-org/matrix-sdk-crypto-wasm'],
  },
});
