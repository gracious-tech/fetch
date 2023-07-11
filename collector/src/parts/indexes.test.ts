import {join} from 'path'
import {describe, it} from 'vitest'
import {generate_index_content, update_indexes} from './indexes'
import { statSync } from 'fs'


describe('generate_index_content', () => {

    it("Returns a HTML string", ({expect}) => {
        const html = generate_index_content(join('dist', 'bibles', 'eng_bsb'))
        const actual = html.toLowerCase()
        expect(actual).toContain('<!doctype html>')
        expect(actual).toContain('<html>')
        expect(actual).toContain('</html>')
    })

    it("Returns correct breadcrumbs", ({expect}) => {
        const html = generate_index_content(join('dist', 'bibles', 'eng_bsb'), ['dist'])
        const actual = html.toLowerCase()
        expect(actual).not.toContain('<li><a href="../../../">/</a></li>')
        expect(actual).not.toContain('<li><a href="../../">dist</a></li>')
        expect(actual).toContain('<li><a href="../">bibles</a></li>')
        expect(actual).toContain('<li class="last">eng_bsb</li>')
    })

    describe("Handling directories", () => {

        const html = generate_index_content(join('dist', 'bibles', 'eng_bsb'))
        const actual = html.toLowerCase()

        it("Contains links to the different available directories", ({expect}) => {
            expect(actual).toContain('<a href="./txt/">txt</a>')
            expect(actual).toContain('<a href="./usfm/">usfm</a>')
            expect(actual).toContain('<a href="./usx/">usx</a>')
            expect(actual).toContain('<a href="./html/">html</a>')
        })
    
        it("Contains the number of files in directories", ({expect}) => {
            expect(actual).toContain('<span data-entry-name="txt">66</span>')
            expect(actual).toContain('<span data-entry-name="usfm">66</span>')
            expect(actual).toContain('<span data-entry-name="usx">66</span>')
            expect(actual).toContain('<span data-entry-name="html">66</span>')
        })

    })

    describe("Handling files", () => {

        const html = generate_index_content(join('dist', 'bibles'))
        const actual = html.toLowerCase()

        it("Contains links to the different available files", ({expect}) => {
            expect(actual).toContain('<a href="./manifest.json">manifest.json</a>')
        })
    
        it("Contains the number of files", ({expect}) => {
            const expected_size = statSync(join('dist', 'bibles', 'manifest.json')).size
            expect(actual).toContain(`<span data-entry-name="manifest.json">${expected_size.toLocaleString()} bytes</span>`)
        })

    })

})


// describe('update_indexes', () => {

//     it("Generates parent dir index when file changes", ({expect}) => {
//         const out = update_indexes(['dist/bibles/manifest.json'], [])
//         expect(out.update.map(i => i.path)).toEqual(['dist/bibles/'])
//         expect(out.remove).toHaveLength(0)
//     })

//     it("Doesn't duplicate when files in same dir changed", ({expect}) => {
//         const out = update_indexes(['dist/bibles/manifest.json', 'dist/bibles/fake'], [])
//         expect(out.update).toHaveLength(1)
//         expect(out.remove).toHaveLength(0)
//     })

//     it("Generates parent dir indexes when a file removed", ({expect}) => {
//         const out = update_indexes([], ['dist/bibles/fake'])
//         // Parent dir needs to remove file, and grandparent dir needs to update size of parent dir
//         expect(out.update.map(i => i.path).sort()).toEqual(['dist/', 'dist/bibles/'])
//         expect(out.remove).toHaveLength(0)
//     })

//     it("Removes parent index when no more files", ({expect}) => {
//         const out = update_indexes([], ['dist/bibles/fake/file'])
//         expect(out.update.map(i => i.path).sort()).toEqual(['dist/', 'dist/bibles/'])
//         expect(out.remove).toEqual(['dist/bibles/fake/'])
//     })

//     it("Removes multiple parents when no more files", ({expect}) => {
//         const out = update_indexes([], ['dist/bibles/fake/fake/file'])
//         expect(out.update.map(i => i.path).sort()).toEqual(['dist/', 'dist/bibles/'])
//         expect(out.remove.sort()).toEqual(['dist/bibles/fake/', 'dist/bibles/fake/fake/'])
//     })

//     it("Doesn't generate index for a dir higher than `dist/`", ({expect}) => {
//         const out = update_indexes(['dist/file'], [])
//         expect(out.update.map(i => i.path)).toEqual(['dist/'])
//         expect(out.remove).toHaveLength(0)
//     })

// })
