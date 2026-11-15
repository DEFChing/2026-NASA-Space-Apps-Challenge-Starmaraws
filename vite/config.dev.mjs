// SI disclosure: the assetFiles plugin lines were added with assistance from Claude
// (Anthropic), a large language model, then reviewed and tested by the Junior Astronaut
// team. The rest of this file comes from the Phaser React template. See AI_USAGE.md.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { assetFiles } from './assetFiles.mjs'

// https://vitejs.dev/config/
export default defineConfig({
    base: './',
    plugins: [
        react(),
        assetFiles(),
    ],
    server: {
        port: 8080
    }
})
