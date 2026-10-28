
import {readFileSync} from 'node:fs'

import {describe, it, vi} from 'vitest'

import {update_glosses} from './gloss.js'
import {download_glosses, sources_to_dist} from '../integrations/gbt.js'
import {update_manifest} from '../parts/manifest.js'
import {use_temp_cwd, write_files} from '../parts/test_utils.js'


// GBT integration is tested separately, so just confirm it's orchestrated correctly
vi.mock('../integrations/gbt.js', () => ({
    gbt_source_dir: 'sources/glosses/gbt',
    download_glosses: vi.fn(() => {
        write_files({'sources/glosses/gbt/.original/json/gen.json': ''})
    }),
    sources_to_dist: vi.fn(() => {
        write_files({'dist/glosses/eng_gbt/json/gen.json': ''})
    }),
}))
vi.mock('../parts/manifest.js', () => ({update_manifest: vi.fn()}))


describe('update_glosses', () => {

    use_temp_cwd()

    it("Downloads only when missing or requested, then processes", async ({expect}) => {
        await update_glosses(false)
        expect(download_glosses).toHaveBeenCalledTimes(1)
        expect(sources_to_dist).toHaveBeenCalledTimes(1)
        expect(update_manifest).toHaveBeenCalledTimes(1)
        expect(readFileSync('unpublished.txt', 'utf8'))
            .toBe('glosses/eng_gbt\nsearch/ot_gbt\nsearch/nt_gbt\n')

        await update_glosses(false)
        expect(download_glosses).toHaveBeenCalledTimes(1)

        await update_glosses(true)
        expect(download_glosses).toHaveBeenCalledTimes(2)
        expect(sources_to_dist).toHaveBeenCalledTimes(3)
    })

})
