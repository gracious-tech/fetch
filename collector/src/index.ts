#!/usr/bin/env node

import yargs from 'yargs'

import {report_invalid_books, report_incomplete, report_items, report_unprocessed,
    report_invalid_meta} from './commands/report.js'
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

import type {TransServiceId} from './parts/types'

import './parts/console_colors.js'


// Process CLI args
await yargs(process.argv.slice(2))
    .scriptName('fetch-collector')

    // Setup
    .command('setup', "Setup new collection", {},
        argv => Promise.all([init_config(), gen_language_data(), update_usfmtc()]).then(x => {}))
    .command('setup-data', "Update data on world's languages", {},
        argv => gen_language_data())
    .command('setup-usfmtc [version]', "Install usfmtc (USFM/USX converter) into a local venv", {},
        argv => update_usfmtc(argv['version'] as string))

    // Bibles
    .command('discover [service] [id]', "Discover what translations are available", {},
        argv => discover_translations(argv['service'] as TransServiceId, argv['id'] as string))
    .command('download [id]', "Download source files (--recheck for updating existing)",
        {recheck: {type: 'boolean'}},
        argv => download_source(!!argv['recheck'], argv['id'] as string))
    .command('process [id]', "Convert source files to distributable formats", {},
        argv => update_dist(argv['id'] as string))
    .command('debug-convert [id] [book] [stage]', "Dump a source book at a pipeline stage", {},
        argv => debug_convert(argv['id'] as string, argv['book'] as string,
            argv['stage'] as string))

    // Other
    .command('notes', "Download and update study notes", {redownload: {type: 'boolean'}},
        argv => update_notes(!!argv['redownload']))
    .command('glosses', "Download and update glosses", {redownload: {type: 'boolean'}},
        argv => update_glosses(!!argv['redownload']))
    .command('crossref', "Generate cross-references data", {},
        argv => crossref_process())
    .command('sections', "Update section stats data (importance/popularity)", {},
        argv => sections_process())
    .command('manifest', "Update manifest (without updating actual translations)", {},
        argv => update_manifest())
    .command('extra', "Fill missing extra.json data from sibling translations", {},
        argv => build_extra_overlay())

    // Serve
    .command('serve [port]', "Serve the collection for testing", {},
        argv => serve(argv['port'] ? parseInt(argv['port'] as string) : undefined))

    // Publish
    .command('publish', "Sync all resources", {force: {type: 'boolean'}},
        argv => publish(!!argv['force']))

    // Maintenance
    .command('clean', "Remove any unnecessary files from the collection", {},
        argv => clean_collection())

    // Report
    .command('report', "Report the status of included translations", {},
        argv => report_items())
    .command('report-invalid-meta', "Report translations with invalid metadata", {},
        argv => report_invalid_meta())
    .command('report-bookless', "Report translations with no valid books", {},
        argv => report_invalid_books(true))
    .command('report-invalid-books', "Report translations with invalid books", {},
        argv => report_invalid_books())
    .command('report-incomplete', "Report translations with almost complete testaments", {},
        argv => report_incomplete())
    .command('report-unprocessed [type]', "Report translations yet to be processed", {},
        argv => report_unprocessed(argv['type'] as 'usfmx'|'other'|undefined))

    // Show help when no command
    .demandCommand()
    .strict()
    .help()
    .fail((msg, error) => {
        // Output whole stack, not just message
        console.error(error?.stack ?? msg)
    })

    // Trigger processing
    .argv
