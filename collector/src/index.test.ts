
import {describe, it, vi, beforeEach, afterEach} from 'vitest'

import * as report from './commands/report.js'
import {publish} from './commands/publish.js'
import {serve} from './commands/serve.js'
import {update_dist} from './commands/process.js'
import {build_extra_overlay} from './parts/extra_overlay.js'
import {debug_convert} from './commands/debug.js'
import {download_source} from './commands/download.js'
import {clean_collection} from './commands/maintenance.js'
import {discover_translations} from './commands/discover.js'
import {gen_language_data} from './parts/languages.js'
import {update_usfmtc} from './parts/usfmtc.js'
import {init_config} from './parts/config.js'
import {update_manifest} from './parts/manifest.js'
import {update_notes} from './resources/notes.js'
import {update_glosses} from './resources/gloss.js'
import {crossref_process} from './data/crossref.js'
import {sections_process} from './data/sections.js'


// Mock every command so the CLI only wires args through to them
vi.mock('./commands/report.js', () => ({report_invalid_books: vi.fn(), report_incomplete: vi.fn(),
    report_items: vi.fn(), report_unprocessed: vi.fn(), report_invalid_meta: vi.fn()}))
vi.mock('./commands/publish.js', () => ({publish: vi.fn()}))
vi.mock('./commands/serve.js', () => ({serve: vi.fn()}))
vi.mock('./commands/process.js', () => ({update_dist: vi.fn()}))
vi.mock('./parts/extra_overlay.js', () => ({build_extra_overlay: vi.fn()}))
vi.mock('./commands/debug.js', () => ({debug_convert: vi.fn()}))
vi.mock('./commands/download.js', () => ({download_source: vi.fn()}))
vi.mock('./commands/maintenance.js', () => ({clean_collection: vi.fn()}))
vi.mock('./commands/discover.js', () => ({discover_translations: vi.fn()}))
vi.mock('./parts/languages.js', () => ({gen_language_data: vi.fn()}))
vi.mock('./parts/usfmtc.js', () => ({update_usfmtc: vi.fn()}))
vi.mock('./parts/config.js', () => ({init_config: vi.fn()}))
vi.mock('./parts/manifest.js', () => ({update_manifest: vi.fn()}))
vi.mock('./resources/notes.js', () => ({update_notes: vi.fn()}))
vi.mock('./resources/gloss.js', () => ({update_glosses: vi.fn()}))
vi.mock('./data/crossref.js', () => ({crossref_process: vi.fn()}))
vi.mock('./data/sections.js', () => ({sections_process: vi.fn()}))
vi.mock('./parts/console_colors.js', () => ({}))


// Run the CLI with the given args (module re-executes its top-level yargs call each import)
async function cli(...args:string[]){
    process.argv = ['node', 'fetch-collector', ...args]
    vi.resetModules()
    await import('./index.js')
}


describe('CLI', () => {

    const original_argv = process.argv
    beforeEach(() => {
        vi.clearAllMocks()
    })
    afterEach(() => {
        process.argv = original_argv
        vi.restoreAllMocks()
    })

    // Each command line and the call it should produce
    const cases:[string[], () => unknown, unknown[]][] = [
        [['setup-data'], () => gen_language_data, []],
        [['setup-usfmtc'], () => update_usfmtc, [undefined]],
        [['setup-usfmtc', '1.2.3'], () => update_usfmtc, ['1.2.3']],
        [['discover', 'dbl', 'eng_x'], () => discover_translations, ['dbl', 'eng_x']],
        [['download'], () => download_source, [false, undefined]],
        [['download', 'eng_x', '--recheck'], () => download_source, [true, 'eng_x']],
        [['process', 'eng_x'], () => update_dist, ['eng_x']],
        [['debug-convert', 'eng_x', 'gen', 'pre'], () => debug_convert, ['eng_x', 'gen', 'pre']],
        [['notes', '--redownload'], () => update_notes, [true]],
        [['glosses'], () => update_glosses, [false]],
        [['crossref'], () => crossref_process, []],
        [['sections'], () => sections_process, []],
        [['manifest'], () => update_manifest, []],
        [['extra'], () => build_extra_overlay, []],
        [['serve'], () => serve, [undefined]],
        [['serve', '9000'], () => serve, [9000]],
        [['publish', '--force'], () => publish, [true]],
        [['clean'], () => clean_collection, []],
        [['report'], () => report.report_items, []],
        [['report-invalid-meta'], () => report.report_invalid_meta, []],
        [['report-bookless'], () => report.report_invalid_books, [true]],
        [['report-invalid-books'], () => report.report_invalid_books, []],
        [['report-incomplete'], () => report.report_incomplete, []],
        [['report-unprocessed', 'other'], () => report.report_unprocessed, ['other']],
    ]

    it.for(cases)("Wires %j to its command", async ([args, get_fn, expected], {expect}) => {
        await cli(...args)
        expect(get_fn()).toHaveBeenCalledWith(...expected)
    })

    it("Runs all setup steps", async ({expect}) => {
        await cli('setup')
        expect(init_config).toHaveBeenCalledOnce()
        expect(gen_language_data).toHaveBeenCalledOnce()
        expect(update_usfmtc).toHaveBeenCalledOnce()
    })

    it("Reports usage errors", async ({expect}) => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        await cli('not-a-command')
        expect(error).toHaveBeenCalledWith(expect.stringContaining('not-a-command'))
    })

    it("Reports the whole stack when a command fails", async ({expect}) => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
        vi.mocked(update_manifest).mockRejectedValueOnce(new Error("Boom"))
        // NOTE yargs also rejects, so the process still exits with an error code
        await expect(cli('manifest')).rejects.toThrow("Boom")
        expect(error).toHaveBeenCalledWith(expect.stringMatching(/^Error: Boom\n {4}at /))
    })
})

