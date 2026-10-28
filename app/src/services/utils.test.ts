
import {describe, it, vi} from 'vitest'

import {wait, parse_int, escape_html} from './utils'


describe('wait', () => {

    it("Resolves after the given time", async ({expect}) => {
        vi.useFakeTimers()
        let done = false
        const promise = wait(100).then(() => {
            done = true
        })
        await vi.advanceTimersByTimeAsync(99)
        expect(done).toBe(false)
        await vi.advanceTimersByTimeAsync(1)
        await promise
        expect(done).toBe(true)
        vi.useRealTimers()
    })
})


describe('parse_int', () => {

    it("Parses strings and passes numbers through", ({expect}) => {
        expect(parse_int('42')).toBe(42)
        expect(parse_int('42px')).toBe(42)
        expect(parse_int(7)).toBe(7)
    })

    it("Treats invalid input as zero", ({expect}) => {
        expect(parse_int('abc')).toBe(0)
        expect(parse_int(NaN)).toBe(0)
    })

    it("Clamps to min and max", ({expect}) => {
        expect(parse_int('5', 10)).toBe(10)
        expect(parse_int('500', 0, 360)).toBe(360)
        expect(parse_int('50', 0, 360)).toBe(50)
    })
})


describe('escape_html', () => {

    it("Escapes special HTML chars", ({expect}) => {
        expect(escape_html(`<a href="x">Tom & Jerry's</a>`))
            .toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;')
    })
})

