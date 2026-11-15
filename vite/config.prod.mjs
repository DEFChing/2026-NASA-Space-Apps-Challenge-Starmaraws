// SI disclosure: the assetFiles plugin and two-page input lines were added with assistance from Claude
// (Anthropic), a large language model, then reviewed and tested by the Junior Astronaut
// team. The rest of this file comes from the Phaser React template. See AI_USAGE.md.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { assetFiles } from './assetFiles.mjs';

const phasermsg = () => {
    return {
        name: 'phasermsg',
        buildStart() {
            process.stdout.write(`Building for production...\n`);
        },
        buildEnd() {
            const line = "---------------------------------------------------------";
            const msg = `❤️❤️❤️ Tell us about your game! - games@phaser.io ❤️❤️❤️`;
            process.stdout.write(`${line}\n${msg}\n${line}\n`);

            process.stdout.write(`✨ Done ✨\n`);
        }
    }
}

export default defineConfig({
    base: './',
    plugins: [
        react(),
        assetFiles(),
        phasermsg()
    ],
    logLevel: 'warning',
    build: {
        rollupOptions: {
            // Two pages: the game, and the credits page linked from its main menu.
            input: { main: 'index.html', credits: 'credits.html' },
            output: {
                manualChunks: {
                    phaser: ['phaser']
                }
            }
        },
        minify: 'terser',
        terserOptions: {
            compress: {
                passes: 2
            },
            mangle: true,
            format: {
                comments: false
            }
        }
    }
});
