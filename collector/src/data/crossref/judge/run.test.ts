
import {afterEach, beforeEach, describe, it, vi} from 'vitest'

import {make_slices, merge_outputs, print_status} from './campaign.js'


// The campaign itself is tested with the pipeline; here only the CLI dispatch matters
vi.mock('./campaign.js', () => ({
    SLICE_SIZE: 400,
    make_slices: vi.fn(),
    merge_outputs: vi.fn(),
    print_status: vi.fn(),
}))


// Run the CLI module afresh with the given arguments
async function run(...args:string[]):Promise<void>{
    vi.resetModules()
    process.argv = ['node', 'run.js', ...args]
    await import('./run.js')
}


describe('judge campaign CLI', () => {

    const original_argv = process.argv

    beforeEach(() => {
        vi.clearAllMocks()
    })
    afterEach(() => {
        process.argv = original_argv
        process.exitCode = undefined
        vi.restoreAllMocks()
    })

    it("Prints status", async ({expect}) => {
        await run('status')
        expect(print_status).toHaveBeenCalled()
    })

    it("Writes one default-sized slice unless told otherwise", async ({expect}) => {
        await run('slices')
        expect(make_slices).toHaveBeenCalledWith(1, 400)
        await run('slices', '3', '50')
        expect(make_slices).toHaveBeenCalledWith(3, 50)
    })

    it("Merges outputs", async ({expect}) => {
        await run('merge')
        expect(merge_outputs).toHaveBeenCalled()
    })

    it("Explains usage for an unknown action", async ({expect}) => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})
        await run('unknown')
        expect(error).toHaveBeenCalledWith('usage: run.js <status|slices [n] [size]|merge>')
        expect(process.exitCode).toBe(1)
    })
})

