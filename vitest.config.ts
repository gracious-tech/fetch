
import {defineConfig, configDefaults} from 'vitest/config'


// Collection dirs hold thousands of files, so must never be tested or watched (or OS errors)
// NOTE Anchored to repo root (not **/) so this doesn't also match client/src/collection/
const collection_dirs = ['collection/**', 'collection_official/**']


export default defineConfig({
    test: {
        // NOTE Built copies of tests in dist dirs must not run (older vitest excluded them by default)
        exclude: [...configDefaults.exclude, '**/dist/**', ...collection_dirs],
        // Run with `.bin/audit_test run --coverage`
        coverage: {
            provider: 'v8',
            include: ['*/src/**/*.ts', 'converters/*/src/**/*.ts'],
            // TODO Add test coverage for the Vue app (app/) and docs site (site/), skipped for now
            exclude: ['**/*.test.ts', '**/test_utils.ts', '**/*.d.ts', 'app/**', 'site/**'],
            reporter: ['text-summary', 'json-summary', 'json', 'html'],
            reportsDirectory: 'coverage',
        },
    },
    server: {
        watch: {
            ignored: collection_dirs.map(dir => `**/${dir}`),
        },
    },
})
