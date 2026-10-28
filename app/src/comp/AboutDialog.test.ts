
import {describe, it} from 'vitest'
import {nextTick} from 'vue'

import {mount_app} from '@/services/test_utils'
import {state} from '@/services/state'
import AboutDialog from './AboutDialog.vue'


describe('AboutDialog', () => {

    it("Shows credits and closes", async ({expect}) => {
        state.show_about_dialog = true
        state.study_notes = true
        const wrapper = mount_app(AboutDialog)
        await nextTick()
        expect(document.body.textContent).toContain('fetch(bible)')
        expect(document.body.textContent).toContain('Tyndale')
        document.querySelector<HTMLButtonElement>('.v-toolbar button')!.click()
        expect(state.show_about_dialog).toBe(false)
        wrapper.unmount()
    })
})
