
import plugin_vue from '@vitejs/plugin-vue'
import plugin_vuetify from 'vite-plugin-vuetify'
import plugin_svg_loader from 'vite-svg-loader'
import {defineConfig, configDefaults} from 'vitest/config'


// Collection dirs hold thousands of files, so must never be tested or watched (or OS errors)
// NOTE Anchored to repo root (not **/) so this doesn't also match client/src/collection/
const collection_dirs = ['collection/**', 'collection_official/**']

// Workspaces with Vue components, which run in their own project with a DOM
const vue_dirs = ['app/**', 'site/**']


export default defineConfig({
    test: {
        // NOTE Built copies of tests in dist dirs must not run (older vitest excluded them)
        exclude: [...configDefaults.exclude, '**/dist/**', ...collection_dirs],
        // Run with `.bin/audit_test run --coverage`
        coverage: {
            provider: 'v8',
            include: ['*/src/**/*.{ts,vue}', 'converters/*/src/**/*.ts',
                'site/.vitepress/theme/**/*.{ts,vue}'],
            exclude: ['**/*.test.ts', '**/test_utils.ts', '**/*.d.ts'],
            reporter: ['text-summary', 'json-summary', 'json', 'html'],
            reportsDirectory: 'coverage',
        },
        projects: [
            {
                extends: true,
                test: {
                    name: 'node',
                    exclude: [...configDefaults.exclude, '**/dist/**', ...collection_dirs,
                        ...vue_dirs],
                },
            },
            {
                extends: true,
                plugins: [plugin_vue(), plugin_vuetify(), plugin_svg_loader()],
                test: {
                    name: 'vue',
                    include: vue_dirs.map(dir => `${dir}/*.test.ts`),
                    exclude: [...configDefaults.exclude, '**/dist/**'],
                    environment: 'jsdom',
                    // Vuetify ships CSS imports that must go through Vite rather than Node
                    server: {deps: {inline: ['vuetify']}},
                },
            },
        ],
    },
    resolve: {
        // Mirror the app's `@` alias for its src dir
        alias: [{find: /^@\//, replacement: `${import.meta.dirname}/app/src/`}],
    },
    server: {
        watch: {
            ignored: collection_dirs.map(dir => `**/${dir}`),
        },
    },
})
