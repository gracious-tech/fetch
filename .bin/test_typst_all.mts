
// Compile the Typst output of every Bible book and every study notes book in a collection,
// reporting which verses/notes fail. Usage: .bin/test_typst_all [--collection dir] [--jobs N]
// [--notes-bible id] [id ...] — ids optionally limit which translations/notes are checked, and
// notes are rendered as footnotes within the --notes-bible translation's text (once, not per Bible)

import {execFile} from 'node:child_process'
import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync}
    from 'node:fs'
import {availableParallelism, tmpdir} from 'node:os'
import {join} from 'node:path'
import {parseArgs} from 'node:util'

import {default_typst_definitions} from '../converters/usx-to-json/dist/esm/index.js'
import {default_notes_typst_definitions} from '../collector/dist/parts/notes_typst.js'
import {join_typst_chunks, label_typst_errors, typst_bin}
    from '../collector/dist/parts/typst_check.js'


// A labelled chunk of Typst markup (mirrors collector's TypstSnippet)
interface Chunk {
    label:string
    body:string
}


// One document to compile (a single book of a translation or of a notes resource)
interface Job {
    label:string
    path:string
    kind:'bibles'|'notes'
}


// Parse CLI args
const {values: args, positionals: only_ids} = parseArgs({
    allowPositionals: true,
    options: {
        collection: {type: 'string', default: 'collection'},
        jobs: {type: 'string', default: String(availableParallelism())},
        'notes-bible': {type: 'string', default: 'eng_bsb'},
    },
})
const dist_dir = join(args.collection, 'dist')
const report_dir = join(args.collection, 'typst_check')
const bin = typst_bin()


// List every book's Typst JSON for each translation/notes resource of the given kind
function list_jobs(kind:Job['kind']):Job[]{
    const kind_dir = join(dist_dir, kind)
    if (!existsSync(kind_dir)){
        return []
    }
    const jobs:Job[] = []
    for (const id of readdirSync(kind_dir).sort()){
        const typst_dir = join(kind_dir, id, 'typst')
        if ((only_ids.length && !only_ids.includes(id)) || !existsSync(typst_dir)){
            continue
        }
        for (const file of readdirSync(typst_dir).sort()){
            jobs.push({label: `${id} ${file.slice(0, -'.json'.length)}`,
                path: join(typst_dir, file), kind})
        }
    }
    return jobs
}


// Split a Bible book into per-verse chunks (verses only form valid markup once joined)
function bible_chunks(label:string, data:{contents:string[][][]}):Chunk[]{
    const chunks:Chunk[] = []
    data.contents.forEach((chapter, ch) => {
        chapter.forEach((verse, v) => {
            chunks.push({label: `${label} ${ch}:${v}`, body: verse.join('')})
        })
    })
    return chunks
}


// Render a notes book as footnotes within the Bible text (if available), as a consumer would
function notes_chunks(label:string, data:{book:string,
        verses:Record<string, Record<string, string>>,
        ranges:{start_chapter:number, start_verse:number, contents:string}[]}):Chunk[]{

    // Group footnote chunks by the verse they attach to (ranges attach to their first verse)
    const by_verse = new Map<string, Chunk[]>()
    const attach = (ref:string, note_label:string, body:string):void => {
        const chunk = {label: note_label, body: `#footnote[${body}]`}
        by_verse.set(ref, [...by_verse.get(ref) ?? [], chunk])
    }
    for (const [ch, verses] of Object.entries(data.verses)){
        for (const [v, body] of Object.entries(verses)){
            attach(`${ch}:${v}`, `${label} ${ch}:${v}`, body)
        }
    }
    for (const range of data.ranges){
        const ref = `${range.start_chapter}:${range.start_verse}`
        attach(ref, `${label} ${ref}+`, range.contents)
    }

    // Place footnotes at the end of each verse's text, before any paragraph close
    const chunks:Chunk[] = []
    const bible_path = join(dist_dir, 'bibles', args['notes-bible'], 'typst', `${data.book}.json`)
    if (existsSync(bible_path)){
        const bible = JSON.parse(readFileSync(bible_path, 'utf8')) as {contents:string[][][]}
        const bible_label = `${args['notes-bible']} ${data.book}`
        bible.contents.forEach((chapter, ch) => {
            chapter.forEach(([open, body, close], v) => {
                const verse_label = `${bible_label} ${ch}:${v}`
                chunks.push({label: verse_label, body: open! + body!})
                chunks.push(...by_verse.get(`${ch}:${v}`) ?? [])
                by_verse.delete(`${ch}:${v}`)
                chunks.push({label: verse_label, body: close!})
            })
        })
    }

    // Any notes without a matching verse (or no Bible book) get placeholder text instead
    for (const notes of by_verse.values()){
        for (const note of notes){
            chunks.push({label: note.label, body: `Text${note.body}\n\n`})
        }
    }
    return chunks
}


// Compile a single book, resolving to a list of labelled errors (empty if it compiled)
async function run_job(job:Job, tmp:string, index:number):Promise<string[]>{

    // Build the document
    const data = JSON.parse(readFileSync(job.path, 'utf8'))
    const [chunks, preamble] = job.kind === 'bibles'
        ? [bible_chunks(job.label, data), default_typst_definitions]
        : [notes_chunks(job.label, data),
            default_typst_definitions + default_notes_typst_definitions]
    const doc = join_typst_chunks(chunks, preamble)
    const typ_path = join(tmp, `${index}.typ`)
    writeFileSync(typ_path, doc.source)

    // Compile, discarding the PDF and keeping only errors
    const stderr = await new Promise<string>(resolve => {
        execFile(bin, ['compile', '--format', 'pdf', '--diagnostic-format', 'short', typ_path,
            '/dev/null'], {encoding: 'utf8', maxBuffer: 1 << 28}, (error, _stdout, stderr) => {
            resolve(error ? stderr || error.message : '')
        })
    })
    rmSync(typ_path)
    if (!stderr){
        return []
    }

    // Keep the failing document for debugging
    writeFileSync(join(report_dir, `${job.label.replace(' ', '_')}.typ`), doc.source)
    return label_typst_errors(stderr, chunks, doc)
}


// Run all jobs with limited concurrency, collecting errors
async function main():Promise<void>{
    const jobs = [...list_jobs('bibles'), ...list_jobs('notes')]

    // Warn if notes can't be placed within Bible text
    if (jobs.some(job => job.kind === 'notes')
            && !existsSync(join(dist_dir, 'bibles', args['notes-bible'], 'typst'))){
        console.warn(`No ${args['notes-bible']} Typst in collection, notes checked without it`)
    }
    rmSync(report_dir, {recursive: true, force: true})
    mkdirSync(report_dir, {recursive: true})
    const tmp = mkdtempSync(join(tmpdir(), 'typst-all-'))
    const errors:string[] = []
    let next = 0
    let done = 0

    // Each worker pulls the next job until none remain
    const worker = async ():Promise<void> => {
        while (next < jobs.length){
            const index = next++
            const job = jobs[index]!
            try {
                errors.push(...await run_job(job, tmp, index))
            } catch (error){
                errors.push(`${job.label}: ${String(error)}`)
            }
            done++
            if (process.stderr.isTTY){
                process.stderr.write(`\r${done}/${jobs.length} books, ${errors.length} errors`)
            }
        }
    }
    await Promise.all(Array.from({length: parseInt(args.jobs, 10)}, worker))
    rmSync(tmp, {recursive: true, force: true})
    if (process.stderr.isTTY){
        process.stderr.write('\n')
    }

    // Write full report, and print a compact summary grouped by error message
    writeFileSync(join(report_dir, 'report.txt'), errors.join('\n') + '\n')
    const groups = new Map<string, string[]>()
    for (const error of errors){
        const sep = error.indexOf(': ')
        const label = sep === -1 ? '?' : error.slice(0, sep)
        const message = sep === -1 ? error : error.slice(sep + 2)
        groups.set(message, [...groups.get(message) ?? [], label])
    }
    console.info(`Checked ${jobs.length} books, ${errors.length} errors`)
    for (const [message, labels] of [...groups].sort((a, b) => b[1].length - a[1].length)){
        const examples = labels.slice(0, 3).join(', ') + (labels.length > 3 ? ', ...' : '')
        console.info(`${labels.length}× ${message.slice(0, 200)} [${examples}]`)
    }
    if (errors.length){
        console.info(`Full report and failing documents in ${report_dir}/`)
        process.exitCode = 1
    }
}


await main()
