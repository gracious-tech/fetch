
import {defineConfig} from 'vitest/config'


// Need to chdir for some tests so must disable multi-threading
export default defineConfig({
    test: {
        threads: false,
    },
})
