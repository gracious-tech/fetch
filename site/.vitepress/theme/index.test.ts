
import {describe, it, vi} from 'vitest'

import type {App} from 'vue'
import type {EnhanceAppContext} from 'vitepress'


vi.mock('vitepress/theme', () => ({default: {Layout: 'DefaultLayout', NotFound: 'NotFound'},
    VPButton: 'VPButton'}))
vi.mock('./CustomLayout.vue', () => ({default: 'CustomLayout'}))


describe('theme', () => {

    it("Extends the default theme with the custom layout", async ({expect}) => {
        const theme = (await import('./index')).default
        expect(theme).toMatchObject({Layout: 'CustomLayout', NotFound: 'NotFound'})
    })

    it("Registers VPButton globally (for use in markdown)", async ({expect}) => {
        const theme = (await import('./index')).default
        const component = vi.fn()
        void theme.enhanceApp!({app: {component} as unknown as App} as EnhanceAppContext)
        expect(component).toHaveBeenCalledWith('VPButton', 'VPButton')
    })
})
