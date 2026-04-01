import {defineConfig} from 'vite';
import preact from '@preact/preset-vite';
import {resolve} from 'path';

export default defineConfig({
    plugins: [preact()],
    resolve: {
        alias: {
            'uwurandom': resolve(__dirname, 'uwurandom/uwurandom-js/dist/uwurandom.mjs')
        }
    },
    css: {
        modules: {
            localsConvention: 'camelCase'
        }
    }
});
