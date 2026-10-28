
import {readFileSync} from 'node:fs'

import {afterEach, describe, it, vi} from 'vitest'

import {crossref_process} from './crossref.js'
import {make_zip, stub_fetch, use_temp_cwd} from '../parts/test_utils.js'


// Read a JSON file written by the module under test
function read(path:string):unknown{
    return JSON.parse(readFileSync(path, 'utf8'))
}


describe('crossref_process', () => {

    use_temp_cwd()
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it("Writes every book at three sizes filtered by relevance", async ({expect}) => {
        stub_fetch({'https://a.openbible.info/data/cross-references.zip': make_zip({
            'cross_references.txt': 'From Verse\tTo Verse\tVotes\n'
                + 'Gen.1.1\tJohn.1.1\t100\nGen.1.1\tHeb.11.3\t50\nGen.1.2\tPs.33.6\t1\n',
        })})
        await crossref_process()

        // Larger sizes include less relevant references (relevance score itself removed)
        expect(read('dist/crossref/small/gen.json')).toEqual({1: {1: [['jhn', 1, 1]]}})
        expect(read('dist/crossref/medium/gen.json'))
            .toEqual({1: {1: [['jhn', 1, 1], ['heb', 11, 3]]}})
        expect(read('dist/crossref/large/gen.json'))
            .toEqual({1: {1: [['jhn', 1, 1], ['heb', 11, 3]], 2: [['psa', 33, 6]]}})

        // Books without references still written
        expect(read('dist/crossref/large/rev.json')).toEqual({})
        expect(readFileSync('unpublished.txt', 'utf8'))
            .toBe('crossref/small\ncrossref/medium\ncrossref/large\n')
    })

})
