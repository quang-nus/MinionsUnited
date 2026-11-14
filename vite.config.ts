import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves the game from https://<user>.github.io/<repo>/, not from
  // the site root. A relative base ('./') makes every built file load from the
  // folder the page is in, so the same build works under any repo name and
  // with `npm run preview`. The game has no router, so this is all it needs.
  base: './',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
