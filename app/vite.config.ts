
import path from 'path'

import plugin_vue from '@vitejs/plugin-vue'
import plugin_vuetify from 'vite-plugin-vuetify'
import plugin_svg_loader from 'vite-svg-loader'
import {generateSW} from 'rollup-plugin-workbox'
import {defineConfig} from 'vite'

import plugin_index from './vite_plugin_index'


export default defineConfig(({mode}) => {
    return {
        clearScreen: false,
        plugins: [
            plugin_index(path.join(__dirname, 'src/index.pug')),
            plugin_vue(),
            plugin_svg_loader(),
            plugin_vuetify(),
            generateSW({
                swDest: 'dist/sw.js',  // WARN Must be at root level to control all paths
                globDirectory: 'dist',
                globPatterns: ['**/*'],  // Override default which excludes images etc
                cacheId: 'fetch',  // Will get -precache-... appended
                runtimeCaching: [
                    {
                        // Runtime caching for any external content (i.e. collections)
                        // TODO Check periodically rather than every time?
                        // See https://github.com/GoogleChrome/workbox/issues/3069
                        handler: 'StaleWhileRevalidate',
                        urlPattern: route => !route.sameOrigin,
                        options: {
                            cacheName: 'fetch-collections',
                        },
                    },
                ],
            }),
        ],
        resolve: {
            alias: [
                {
                    find: '@',
                    replacement: path.resolve(__dirname, 'src'),
                },
            ],
        },
        css: {
            devSourcemap: true,  // Include source map when injecting CSS in JS
        },
        server: {
            fs: {
                strict: true,
            },
        },
        build: {
            target: 'es2015',  // Currently supporting browsers ES2015+
            cssTarget: 'safari10',  // Prevent things like top/left/bottom/right -> 'inset'
        },
    }
})
