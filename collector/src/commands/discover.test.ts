
import {describe, it, vi, beforeEach, afterEach} from 'vitest'

import {discover_translations} from './discover.js'
import * as door43 from '../integrations/door43.js'
import * as ebible from '../integrations/ebible.js'
import * as dbl from '../integrations/dbl.js'
import {use_temp_cwd, write_files} from '../parts/test_utils.js'


// Each service's discovery is tested in its own integration's tests
vi.mock('../integrations/door43.js', () => ({discover: vi.fn()}))
vi.mock('../integrations/ebible.js', () => ({discover: vi.fn()}))
vi.mock('../integrations/dbl.js', () => ({discover: vi.fn()}))


// A minimal valid meta file with the given service ids
function meta(ids:Record<string, string>){
    return {
        name: {local: '', local_abbrev: '', english: 'X', english_abbrev: 'X'},
        year: 2000, direction: 'ltr', tags: [], ids,
        copyright: {attribution: '', attribution_url: '', licenses: []},
        source: {service: 'manual', format: 'usfm', updated: '', revision: 0, url: null},
    }
}


describe('discover_translations', () => {

    // NOTE Must register temp cwd before writing fixtures
    use_temp_cwd()

    beforeEach(() => {
        write_files({
            'sources/bibles/a/meta.json': meta({ebible: 'e1', dbl: 'd1'}),
            'sources/bibles/b/meta.json': meta({door43: 'o1', ebible: 'e2'}),
        })
    })

    afterEach(() => {
        vi.clearAllMocks()
        vi.restoreAllMocks()
    })

    it("Rejects an unknown service", async ({expect}) => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        await discover_translations('nope' as 'dbl')
        expect(error).toHaveBeenCalledWith('Service must be one of: door43, ebible, dbl')
        expect(dbl.discover).not.toHaveBeenCalled()
    })

    it("Consults DBL then eBible by default, passing existing ids", async ({expect}) => {
        await discover_translations(undefined as unknown as 'dbl', 'x')
        expect(dbl.discover).toHaveBeenCalledWith(['d1'], 'x')
        expect(vi.mocked(ebible.discover).mock.calls[0]![0].sort()).toEqual(['e1', 'e2'])
        expect(door43.discover).not.toHaveBeenCalled()
    })

    it("Only consults the requested service", async ({expect}) => {
        await discover_translations('door43')
        expect(door43.discover).toHaveBeenCalledWith(['o1'], undefined)
        expect(dbl.discover).not.toHaveBeenCalled()
        expect(ebible.discover).not.toHaveBeenCalled()
        await discover_translations('ebible')
        expect(ebible.discover).toHaveBeenCalledTimes(1)
        expect(dbl.discover).not.toHaveBeenCalled()
    })
})

