#!/usr/bin/env node
// One-off generator for translation-independent Bible section stats (importance + popularity).
// Reads the eng_bsb reference sectionization, rates every section via the Claude API, and writes
//     both the committed source of truth and the publishable collection file.
// Usage: node .bin/gen_section_data.ts [book...] [--dry] [--force]

import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

import Anthropic from '@anthropic-ai/sdk'
import {z} from 'zod'
import {books_ordered, book_names_english} from '@gracious.tech/bible-references'


// A section as stored in the reference translation's extra.json
interface RefSection {
    start_chapter:number
    start_verse:number
    end_chapter:number
    end_verse:number
    heading:string|null
}

// One rated section (matches the SectionStat type in collector/src/parts/shared_types.ts)
interface SectionStat extends Omit<RefSection, 'heading'> {
    importance:number
    popularity:number
    reason?:string
}

// The whole resource (matches DistSectionData in shared_types.ts)
interface DistSectionData {
    model:string
    generated:string
    sections:Record<string, SectionStat[]>
}


// Config
const MODEL = 'claude-opus-4-8'
const CHUNK_THRESHOLD = 130  // Books with more sections than this are split into 2 calls
const INPUT_RATE_PER_MTOK = 5  // Opus 4.8 pricing (USD)
const OUTPUT_RATE_PER_MTOK = 25

// Paths (relative to repo root, resolved from this script's location so cwd doesn't matter)
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const REF_EXTRA = join(REPO, 'collection', 'dist', 'bibles', 'eng_bsb', 'extra.json')
const OUT_SOURCE = join(REPO, 'collector', 'src', 'data', 'sections.json')


// The fixed rubric applied to every call
const SYSTEM = `You are annotating every section of the Bible (all 66 books, ~3085 sections) with two \
independent 1-5 stats, for a public dataset published alongside fetch.bible's section data.

IMPORTANCE (1-5) — theological/doctrinal/narrative weight within Christian scripture:
1 = Minor/incidental (a genealogy entry, a travel notice, a routine list).
2 = Supporting material that develops a book's themes but isn't pivotal on its own.
3 = A recognizable passage that meaningfully advances its book's narrative or argument.
4 = Central to its book and frequently cited in theology, preaching, or systematic doctrine.
5 = A cornerstone of the whole Christian canon (Creation, the Fall, the Ten Commandments,
    the Crucifixion, the Resurrection, Pentecost, the Great Commission).

POPULARITY (1-5) — how culturally famous the passage is:
1 = Essentially unknown outside biblical specialists.
2 = Familiar to regular churchgoers/Bible readers, not known beyond that.
3 = Recognized by most Christians, vaguely familiar in general culture.
4 = Broadly known even to many non-religious people (the Good Samaritan, David and Goliath).
5 = Universally iconic (Noah's Ark, the Ten Commandments, the Nativity, Jonah and the whale,
    the Lord's Prayer, the Crucifixion, the parting of the Red Sea).

These stats are DELIBERATELY INDEPENDENT and often diverge — e.g. Jonah swallowed by the
fish is more popular than it is important. Score every section against the fixed anchors above
so scores stay comparable across the whole Bible, not just relative to this book's other
sections. The aim is to end up with a somewhat even amount of sections for each score across the whole Bible (but not necessarily for a single book).

For each section, return integer 1-5 scores for both, and a short reason (one sentence,
under 20 words). Return a rating for every section listed, keyed by its given index.`


// JSON schema constraining the structured output
// Runtime validation of everything read in (the API response and JSON files are never trusted)
const score = z.number().int().min(1).max(5)
const range_fields = {
    start_chapter: z.number().int().positive(),
    start_verse: z.number().int().positive(),
    end_chapter: z.number().int().positive(),
    end_verse: z.number().int().positive(),
}
const ratings_response = z.strictObject({
    ratings: z.array(z.strictObject({
        index: z.number().int(),
        importance: score,
        popularity: score,
        reason: z.string(),
    })),
})
const ref_extra = z.object({
    sections: z.record(z.string(), z.array(z.object({...range_fields,
        heading: z.string().nullable()}))),
    chapter_headings: z.record(z.string(), z.array(z.string())),
})
const section_data = z.strictObject({
    model: z.string(),
    generated: z.string(),
    sections: z.record(z.string(), z.array(z.strictObject({...range_fields, importance: score,
        popularity: score, reason: z.exactOptional(z.string())}))),
})


// Parse JSON text and validate it, throwing an error identifying the source if invalid
function parse_checked<S extends z.ZodType>(text:string, schema:S, source:string):z.infer<S>{
    const result = schema.safeParse(JSON.parse(text))
    if (!result.success){
        throw new Error(`Invalid data from ${source}:\n${z.prettifyError(result.error)}`)
    }
    return result.data
}


// JSON schema the API must follow (validated again with ratings_response once received)
const SCHEMA = {
    type: 'object',
    properties: {
        ratings: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    index: {type: 'integer'},
                    importance: {type: 'integer', enum: [1, 2, 3, 4, 5]},
                    popularity: {type: 'integer', enum: [1, 2, 3, 4, 5]},
                    reason: {type: 'string'},
                },
                required: ['index', 'importance', 'popularity', 'reason'],
                additionalProperties: false,
            },
        },
    },
    required: ['ratings'],
    additionalProperties: false,
}


// Resolve a section's readable heading (null means it matches the chapter heading)
function resolve_heading(section:RefSection, chapter_headings:string[]):string{
    return section.heading ?? chapter_headings[section.start_chapter] ?? ''
}


// Clamp a score to the valid 1-5 integer range
function clamp_score(value:number):number{
    return Math.max(1, Math.min(5, Math.round(value)))
}


// Rate a single chunk of a book's sections (returns index -> {importance, popularity, reason})
async function rate_chunk(client:Anthropic, book_name:string, book:string,
        chunk:{index:number, section:RefSection, heading:string}[], chunk_label:string){

    // Build the numbered list of sections to rate
    const lines = chunk.map(item => {
        const s = item.section
        const range = `${s.start_chapter}:${s.start_verse}-${s.end_chapter}:${s.end_verse}`
        return `${item.index}. "${item.heading}" (${range})`
    }).join('\n')
    const user = `Book: ${book_name} (${book})${chunk_label}\n\n`
        + `Rate every section below. Use the given index for each rating.\n\n${lines}`

    // Request structured ratings
    const response = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        thinking: {type: 'adaptive'},
        output_config: {effort: 'high', format: {type: 'json_schema', schema: SCHEMA}},
        system: SYSTEM,
        messages: [{role: 'user', content: user}],
    })

    // Extract and parse the JSON text block
    const text_block = response.content.find(block => block.type === 'text')
    if (!text_block || text_block.type !== 'text'){
        throw new Error(`No text block returned for ${book}${chunk_label}`)
    }
    const parsed = parse_checked(text_block.text, ratings_response, `API ratings for ${book}`)

    return {
        ratings: parsed.ratings,
        usage: response.usage,
    }
}


// Write the committed source of truth (publishing is the collector's `sections` command)
function write_outputs(data:DistSectionData){
    mkdirSync(dirname(OUT_SOURCE), {recursive: true})

    // Keeps `reason` for auditability (indented for readability); the collector strips it
    writeFileSync(OUT_SOURCE, JSON.stringify(data, undefined, 4))
}


// Main
async function main(){

    // Parse args
    const args = process.argv.slice(2)
    const dry = args.includes('--dry')
    const force = args.includes('--force')
    const requested = args.filter(a => !a.startsWith('--'))
    const target_books = requested.length ? requested : [...books_ordered]

    // Validate requested book codes
    for (const book of target_books){
        if (!books_ordered.includes(book)){
            throw new Error(`Invalid book code: "${book}"`)
        }
    }

    // Load reference sectionization
    if (!existsSync(REF_EXTRA)){
        throw new Error(`Reference sectionization missing: ${REF_EXTRA}\n`
            + `Run: .bin/collector discover ebible eng_bsb && .bin/collector download eng_bsb `
            + `&& .bin/collector process`)
    }
    const ref = parse_checked(readFileSync(REF_EXTRA, 'utf-8'), ref_extra, REF_EXTRA)

    // Load existing output (to merge and to skip already-rated books)
    const existing:DistSectionData = existsSync(OUT_SOURCE)
        ? parse_checked(readFileSync(OUT_SOURCE, 'utf-8'), section_data, OUT_SOURCE)
        : {model: MODEL, generated: '', sections: {}}
    const output:DistSectionData = {
        model: MODEL,
        generated: new Date().toISOString().slice(0, 10),
        sections: {...existing.sections},
    }

    // Build the work list (chunks), skipping already-rated books unless --force
    const chunks:{book:string, book_name:string, chunk_label:string,
        items:{index:number, section:RefSection, heading:string}[]}[] = []
    let skipped = 0
    for (const book of target_books){
        if (!force && output.sections[book]?.length){
            skipped++
            continue
        }
        const sections = ref.sections[book] ?? []
        const headings = ref.chapter_headings[book] ?? []
        const items = sections.map((section, index) => ({
            index, section, heading: resolve_heading(section, headings)}))
        const book_name = book_names_english[book] ?? book

        // Split oversized books into 2 roughly-equal chunks
        if (items.length > CHUNK_THRESHOLD){
            const mid = Math.ceil(items.length / 2)
            chunks.push({book, book_name, chunk_label: ' [part 1 of 2]', items: items.slice(0, mid)})
            chunks.push({book, book_name, chunk_label: ' [part 2 of 2]', items: items.slice(mid)})
        } else if (items.length){
            chunks.push({book, book_name, chunk_label: '', items})
        }
    }

    const total_sections = chunks.reduce((sum, c) => sum + c.items.length, 0)

    // Dry run: report counts and a rough cost estimate, then stop
    if (dry){
        // Rough per-call token heuristics (system + per-section in; per-section + thinking out)
        let est_input = 0
        let est_output = 0
        for (const chunk of chunks){
            est_input += 700 + chunk.items.length * 18
            est_output += 1500 + chunk.items.length * 40
        }
        const cost = est_input / 1e6 * INPUT_RATE_PER_MTOK + est_output / 1e6 * OUTPUT_RATE_PER_MTOK
        console.info(`Books to rate: ${target_books.length - skipped} (skipped ${skipped} `
            + `already-rated)`)
        console.info(`Sections to rate: ${total_sections}`)
        console.info(`API calls: ${chunks.length}`)
        console.info(`Rough cost estimate: ~$${cost.toFixed(2)} (model ${MODEL})`)
        return
    }

    if (!chunks.length){
        console.info('Nothing to rate (all requested books already rated; use --force to redo).')
        return
    }

    // Rate each chunk, accumulating per book and writing after each book completes
    const client = new Anthropic()
    let cost = 0
    let done_sections = 0
    let current_book = ''
    let current_ratings:SectionStat[] = []

    // Flush the accumulated ratings for the current book to disk
    const flush = () => {
        if (current_book){
            current_ratings.sort((a, b) => a.start_chapter - b.start_chapter
                || a.start_verse - b.start_verse)
            output.sections[current_book] = current_ratings
            write_outputs(output)
        }
    }

    for (const chunk of chunks){

        // Starting a new book — flush the previous one
        if (chunk.book !== current_book){
            flush()
            current_book = chunk.book
            current_ratings = []
        }

        console.info(`Rating ${chunk.book_name} (${chunk.book})${chunk.chunk_label} — `
            + `${chunk.items.length} sections...`)
        const {ratings, usage} = await rate_chunk(client, chunk.book_name, chunk.book,
            chunk.items, chunk.chunk_label)

        // Track cost
        cost += (usage.input_tokens ?? 0) / 1e6 * INPUT_RATE_PER_MTOK
            + (usage.output_tokens ?? 0) / 1e6 * OUTPUT_RATE_PER_MTOK

        // Map ratings back to sections by index, validating range and clamping scores
        const valid_indexes = new Set(chunk.items.map(item => item.index))
        const rated_indexes = new Set<number>()
        for (const rating of ratings){
            if (!valid_indexes.has(rating.index)){
                console.warn(`  Ignoring out-of-range index ${rating.index}`)
                continue
            }
            const source = chunk.items.find(item => item.index === rating.index)!.section
            current_ratings.push({
                start_chapter: source.start_chapter,
                start_verse: source.start_verse,
                end_chapter: source.end_chapter,
                end_verse: source.end_verse,
                importance: clamp_score(rating.importance),
                popularity: clamp_score(rating.popularity),
                reason: rating.reason,
            })
            rated_indexes.add(rating.index)
        }

        // Warn about any requested sections the model left unrated
        const missing = chunk.items.filter(item => !rated_indexes.has(item.index))
        if (missing.length){
            console.warn(`  ${missing.length} section(s) left unrated in ${chunk.book}`)
        }
        done_sections += rated_indexes.size
    }
    flush()

    console.info(`\nDone. Rated ${done_sections} sections across `
        + `${new Set(chunks.map(c => c.book)).size} book(s).`)
    console.info(`Actual cost: ~$${cost.toFixed(2)}`)
    console.info(`Wrote: ${OUT_SOURCE}`)
    console.info("Run `.bin/collector sections` to copy into a collection for publishing")
}


await main()
