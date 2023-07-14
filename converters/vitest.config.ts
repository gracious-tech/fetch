
import {defineConfig} from 'vitest/config'


// Converters are cross-platform and assume access to things like DOMParser
export default defineConfig({
    test: {
        environment: 'jsdom',
    },
})
