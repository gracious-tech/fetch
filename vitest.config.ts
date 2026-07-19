
import {defineConfig, configDefaults} from 'vitest/config'

export default defineConfig({
    test: {
        // Exclude collections or vitest will try watch all the files leading to OS error
        // NOTE Anchored to repo root (not **/) so this doesn't also match client/src/collection/
        exclude: [...configDefaults.exclude, 'collection/**', 'collection_official/**'],
        watchExclude: [...configDefaults.watchExclude, 'collection/**', 'collection_official/**'],
    },
})
