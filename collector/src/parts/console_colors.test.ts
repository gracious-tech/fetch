
import colors from 'ansi-colors'
import {describe, it, vi} from 'vitest'


describe('console_colors', () => {

    it("Colors info, warn and error output", async ({expect}) => {
        // Replace the originals before import so the overrides wrap these stubs
        const info = vi.spyOn(console, 'info').mockImplementation(() => undefined)
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        await import('./console_colors.js')

        console.info("i")
        console.warn("w")
        console.error("e")
        expect(info).toHaveBeenCalledWith(colors.blue("i"))
        expect(warn).toHaveBeenCalledWith(colors.yellow("w"))
        expect(error).toHaveBeenCalledWith(colors.red("e"))
    })
})

