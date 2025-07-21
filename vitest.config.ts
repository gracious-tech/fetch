
import {defineConfig, configDefaults} from 'vitest/config'

export default defineConfig({
    test: {
        // Exclude collections or vitest will try watch all the files leading to OS error
        // NOTE vitest is run from within collection dir for sake of collector tests, hence **/
        exclude: [...configDefaults.exclude, '**/collection', '**/collection_official'],
        watchExclude: [...configDefaults.watchExclude, '**/collection', '**/collection_official'],
    },
})
