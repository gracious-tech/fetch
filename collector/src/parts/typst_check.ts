
import {execFileSync} from 'node:child_process'
import {existsSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

import {PKG_PATH} from './utils.js'


// A Typst markup fragment and a label to report it by if it fails to compile
export interface TypstSnippet {
    label:string
    body:string
}


// A joined Typst document and where each chunk starts (1-based line and code point column)
export interface TypstDoc {
    source:string
    starts:[number, number][]
}


// Find the Typst CLI, preferring the repo's .bin/setup_typst copy, else assume on PATH
export function typst_bin():string{
    const local = join(PKG_PATH, '..', '.bin', 'typst')
    return existsSync(local) ? local : 'typst'
}


// Concatenate chunks after a preamble, recording each chunk's start to map errors back
export function join_typst_chunks(chunks:TypstSnippet[], preamble:string):TypstDoc{
    let source = preamble + '\n'
    let line = preamble.split('\n').length + 1
    let col = 1
    const starts:[number, number][] = []
    for (const chunk of chunks){
        starts.push([line, col])
        source += chunk.body

        // Advance position (Typst reports columns in code points, not UTF-16 units)
        const parts = chunk.body.split('\n')
        line += parts.length - 1
        col = (parts.length > 1 ? 1 : col) + [...parts.at(-1)!].length
    }
    return {source, starts}
}


// Label each error in short-format diagnostics with the chunk it occurred in
export function label_typst_errors(output:string, chunks:TypstSnippet[], doc:TypstDoc):string[]{
    const errors:string[] = []
    for (const match of output.matchAll(/^.*?:(\d+):(\d+): error: (.*)$/gm)){
        const line = parseInt(match[1]!, 10)
        const col = parseInt(match[2]!, 10)

        // Find the last chunk starting at or before the error position
        let index = doc.starts.length - 1
        while (index >= 0){
            const [start_line, start_col] = doc.starts[index]!
            if (start_line < line || (start_line === line && start_col <= col)){
                break
            }
            index--
        }
        const label = index >= 0 ? chunks[index]!.label : 'preamble'
        errors.push(`${label}: ${match[3]!}`)
    }

    // Fall back to the raw output if errors were reported in an unexpected format
    if (!errors.length && output.trim()){
        errors.push(output.trim())
    }
    return errors
}


// Compile every snippet (each in its own block) and throw listing any that fail
// Returns false (with a warning) if the Typst CLI isn't available, so can't be checked
export function check_typst_snippets(snippets:TypstSnippet[], preamble:string):boolean{

    // Wrap each snippet in its own block so a broken one can't swallow its neighbours
    const chunks = snippets.map(({label, body}) => ({label, body: `#block[${body}]\n`}))
    const doc = join_typst_chunks(chunks, preamble)

    // Compile in a temp dir (the PDF output is discarded)
    const dir = mkdtempSync(join(tmpdir(), 'typst-check-'))
    const typ_path = join(dir, 'check.typ')
    writeFileSync(typ_path, doc.source)
    let output = ''
    try {
        execFileSync(typst_bin(), ['compile', '--diagnostic-format', 'short', typ_path,
            join(dir, 'check.pdf')], {encoding: 'utf8', stdio: 'pipe', maxBuffer: 1 << 28})
        return true
    } catch (error){
        const err = error as NodeJS.ErrnoException & {stderr?:string}
        if (err.code === 'ENOENT'){
            console.warn("Typst CLI not found (run .bin/setup_typst), skipping Typst validation")
            return false
        }
        output = err.stderr || err.message
    } finally {
        rmSync(dir, {recursive: true, force: true})
    }
    throw new Error(`Typst failed to compile:\n${label_typst_errors(output, chunks, doc).join('\n')}`)
}
