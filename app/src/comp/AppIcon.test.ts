
import {mount_app} from '@/services/test_utils'

import {describe, it} from 'vitest'

import AppIcon from './AppIcon.vue'


describe('AppIcon', () => {

    it("Renders the named icon at normal or small size", ({expect}) => {
        const normal = mount_app(AppIcon, {props: {name: 'close'}})
        const small = mount_app(AppIcon, {props: {name: 'close', small: true}})
        expect(normal.find('svg.icon').exists()).toBe(true)
        expect(normal.classes()).not.toContain('small')
        expect(small.classes()).toContain('small')
        // Same icon either way
        expect(small.find('path').attributes('d')).toBe(normal.find('path').attributes('d'))
        normal.unmount()
        small.unmount()
    })
})
