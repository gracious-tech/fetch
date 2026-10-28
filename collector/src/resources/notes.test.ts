
import {existsSync, readFileSync} from 'node:fs'

import {afterEach, describe, it, vi} from 'vitest'

import {notes_process, update_notes} from './notes.js'
import {update_manifest} from '../parts/manifest.js'
import {check_typst_snippets} from '../parts/typst_check.js'
import {make_zip, stub_fetch, use_temp_cwd, write_files} from '../parts/test_utils.js'


// Avoid needing a real collection or the Typst CLI
vi.mock('../parts/manifest.js', () => ({update_manifest: vi.fn()}))
vi.mock('../parts/typst_check.js', () => ({check_typst_snippets: vi.fn(() => true)}))


// Minimal Tyndale study notes with a verse note and a range note
const xml = `<items release="1.5">
<item name="Gen.1.1"><body><p class="sn-text">In <span class="ital">the</span> beginning</p></body></item>
<item name="Gen.1.2-3"><body><p class="sn-text">The &amp; earth</p></body></item>
</items>`


// Read a JSON file written by the module under test
function read(path:string):unknown{
    return JSON.parse(readFileSync(path, 'utf8'))
}


describe('notes_process', () => {

    use_temp_cwd()
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it("Writes html, txt and typst notes per book and marks ids unpublished", async ({expect}) => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        write_files({
            'sources/notes/tyndale/eng_tyndale/StudyNotes.xml': xml,
            'dist/notes/old_notes/html/gen.json': {},
        })
        await notes_process()

        // Each format written (and old notes cleared)
        expect(read('dist/notes/eng_tyndale/html/gen.json')).toEqual({
            notes_id: 'eng_tyndale', book: 'gen',
            verses: {1: {1: 'In <em>the</em> beginning'}},
            ranges: [{start_chapter: 1, start_verse: 2, end_chapter: 1, end_verse: 3,
                contents: 'The &amp; earth'}],
        })
        expect(read('dist/notes/eng_tyndale/txt/gen.json')).toMatchObject({
            verses: {1: {1: 'In the beginning'}},
            ranges: [{start_verse: 2, contents: 'The & earth'}],
        })
        const typst = read('dist/notes/eng_tyndale/typst/gen.json') as
            {verses:Record<string, Record<string, string>>, ranges:{contents:string}[]}
        expect(typst.verses['1']!['1']).toContain('beginning')
        expect(typst.verses['1']!['1']).not.toContain('<em>')
        expect(typst.ranges[0]!.contents).toContain('earth')
        expect(existsSync('dist/notes/old_notes')).toBe(false)

        // Every note checked with a label identifying it
        const snippets = vi.mocked(check_typst_snippets).mock.calls[0]![0]
        expect(snippets.map(s => s.label))
            .toEqual(['eng_tyndale gen 1:2-1:3', 'eng_tyndale gen 1:1'])

        // Both deleted and current ids need publishing
        expect(readFileSync('unpublished.txt', 'utf8').split('\n'))
            .toEqual(['notes/old_notes', 'notes/eng_tyndale', ''])
    })

    it("Processes each notes dir from its own source", async ({expect}) => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        write_files({
            'sources/notes/tyndale/eng_tyndale/StudyNotes.xml': xml,
            'sources/notes/tyndale/eng_other/StudyNotes.xml': xml.replace('beginning', 'start'),
        })
        await notes_process()
        const verse = (id:string) =>
            (read(`dist/notes/${id}/html/gen.json`) as {verses:{1:{1:string}}}).verses[1][1]
        expect(verse('eng_tyndale')).toContain('beginning')
        expect(verse('eng_other')).toContain('start')
    })

})


describe('update_notes', () => {

    use_temp_cwd()
    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it("Downloads only when missing or requested, then processes", async ({expect}) => {
        vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const url = 'https://tyndaleopenresources.com/wp-content/themes/'
            + 'tyndale-openresources/files/tyndale_open-studynotes.zip'
        const fetch = stub_fetch({[url]:
            make_zip({'Tyndale Open Study Notes/StudyNotes.xml': xml})})

        await update_notes(false)
        expect(fetch).toHaveBeenCalledTimes(1)
        expect(existsSync('dist/notes/eng_tyndale/html/gen.json')).toBe(true)
        expect(update_manifest).toHaveBeenCalled()

        await update_notes(false)
        expect(fetch).toHaveBeenCalledTimes(1)

        await update_notes(true)
        expect(fetch).toHaveBeenCalledTimes(2)
    })

})
