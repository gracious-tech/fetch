
// Re-generate additional versification systems for reverse-usx from Copenhagen Alliance data

// Composes <system> -> org (Copenhagen jsons) with org -> eng (project systems.ts inverted)
// Emits: eng_to_vul / eng_to_rsc / eng_to_rso data + per-book ordered system tests
// Usage (build this package first so ./dist/esm exists):
//   node generate_systems.mjs > generated.ts
//   then manually merge generated.ts into src/systems.ts (keeping hand tweaks like the relaxed
//   NUM/1SA/1KI tests and the PSA test, which are noted in src/systems.ts)
// Mapping data is fetched from the Copenhagen Alliance standard-mappings (same source as the
// existing eng_to_org data) and cached locally so reruns are offline-friendly.
import fs from 'node:fs'
import {eng_to_org} from './dist/esm/systems.js'

const CACHE = new URL('./.copenhagen-cache/', import.meta.url)
const BASE = 'https://raw.githubusercontent.com/Copenhagen-Alliance/'
    + 'versification-specification/master/versification-mappings/standard-mappings/'

// Fetch a standard-mapping json (cached on disk after first download)
async function load(name){
    fs.mkdirSync(CACHE, {recursive: true})
    const cached = new URL(`${name}.json`, CACHE)
    if (!fs.existsSync(cached)){
        const res = await fetch(`${BASE}${name}.json`)
        if (!res.ok){
            throw new Error(`Failed to fetch ${name}.json: ${res.status}`)
        }
        fs.writeFileSync(cached, await res.text())
    }
    return JSON.parse(fs.readFileSync(cached, 'utf8'))
}

const cop = {}
for (const name of ['eng', 'org', 'vul', 'rsc', 'rso']){
    cop[name] = await load(name)
}

const BOOKS_66 = ['GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA','1KI','2KI','1CH',
    '2CH','EZR','NEH','EST','JOB','PSA','PRO','ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS',
    'JOL','AMO','OBA','JON','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL','MAT','MRK','LUK','JHN',
    'ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB',
    'JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV']

// Skip generating composed maps for these (huge and no failing translation needs them yet)
const SKIP_COMPOSED = ['PSA']

function expand(range){
    const book = range.slice(0, 3)
    const [chapter, verses] = range.slice(4).split(':')
    let [v1, v2] = verses.split('-').map(n => parseInt(n))
    v2 ??= v1
    const out = []
    for (let v = v1; v <= v2; v++){
        out.push(`${book} ${chapter}:${v}`)
    }
    return out
}

function exists(sys_max, ref){
    const book = ref.slice(0, 3)
    const [ch, v] = ref.slice(4).split(':').map(n => parseInt(n))
    const counts = sys_max[book]
    if (!counts || ch < 1 || ch > counts.length){
        return false
    }
    return v >= 1 && v <= parseInt(counts[ch - 1])
}

// Build org -> eng verse-level map from project's eng_to_org
const org2eng = new Map()
for (const [correct, incorrect] of Object.entries(eng_to_org)){
    if (correct.endsWith(':0') && !correct.includes('-')){
        // Single ':0' key like 'PSA 51:0': 'PSA 51:2' means org title spans verses 1..2
        const t = parseInt(incorrect.split(':')[1])
        const ch_part = incorrect.split(':')[0]
        for (let v = 1; v <= t; v++){
            org2eng.set(`${ch_part}:${v}`, correct)
        }
        continue
    }
    const cs = expand(correct)
    const is = expand(incorrect)
    if (cs.length !== is.length){
        throw new Error(`length mismatch ${correct} ${incorrect}`)
    }
    for (let i = 0; i < cs.length; i++){
        org2eng.set(is[i], cs[i])
    }
}

// Composed per-book map for a system: {pairs:[[eng,sys]...], subtitles:{engX0:sysRef}}
function compose(sys_name){
    const mv = cop[sys_name].mappedVerses
    const max = cop[sys_name].maxVerses
    const s2o = new Map()
    for (const [k, v] of Object.entries(mv)){
        const ks = expand(k).filter(r => !r.endsWith(':0'))
        const vs = expand(v).filter(r => !r.endsWith(':0'))
        if (ks.length !== vs.length){
            continue  // Deuterocanon cross-book oddities; not 66-book relevant
        }
        for (let i = 0; i < ks.length; i++){
            s2o.set(ks[i], vs[i])
        }
    }
    const books = {}
    for (const book of BOOKS_66){
        if (SKIP_COMPOSED.includes(book)){
            continue
        }
        const counts = max[book]
        if (!counts){
            continue
        }
        const pairs = []
        const subtitles = {}
        let drop = ''
        for (let ch = 1; ch <= counts.length && !drop; ch++){
            for (let v = 1; v <= parseInt(counts[ch - 1]); v++){
                const sref = `${book} ${ch}:${v}`
                const oref = s2o.get(sref) ?? sref
                const eref = org2eng.get(oref) ?? oref
                if (eref === sref){
                    continue
                }
                if (eref.endsWith(':0')){
                    subtitles[eref] = sref
                    continue
                }
                if (eref.slice(0, 3) !== book){
                    drop = `cross-book target ${eref}`
                    break
                }
                if (!exists(cop.eng.maxVerses, eref)){
                    drop = `target ${eref} not in eng`
                    break
                }
                pairs.push([eref, sref])
            }
        }
        if (drop){
            console.error(`DROP ${sys_name} ${book}: ${drop}`)
            continue
        }
        if (pairs.length || Object.keys(subtitles).length){
            books[book] = {pairs, subtitles}
        }
    }
    return books
}

// org's own per-book maps derived from project data (used for tests/ordering too)
function org_books(){
    const books = {}
    for (const book of BOOKS_66){
        const counts = cop.org.maxVerses[book]
        if (!counts){
            continue
        }
        const pairs = []
        const subtitles = {}
        for (let ch = 1; ch <= counts.length; ch++){
            for (let v = 1; v <= parseInt(counts[ch - 1]); v++){
                const oref = `${book} ${ch}:${v}`
                const eref = org2eng.get(oref) ?? oref
                if (eref === oref){
                    continue
                }
                if (eref.endsWith(':0')){
                    subtitles[eref] = oref
                    continue
                }
                pairs.push([eref, oref])
            }
        }
        if (pairs.length || Object.keys(subtitles).length){
            books[book] = {pairs, subtitles}
        }
    }
    return books
}

const systems = {
    org: org_books(),
    vul: compose('vul'),
    rsc: compose('rsc'),
    rso: compose('rso'),
}
const order = ['org', 'vul', 'rsc', 'rso']

// Drop non-monotonic books (reverse-usx can renumber but not move content)
// Walk ALL verses of the variant system in file order (mapped or identity); the eng
// targets must be non-decreasing or chapter markers can't be restored sensibly
for (const name of order){
    for (const [book, data] of Object.entries(systems[name])){
        const mapped = new Map(data.pairs.map(([e, s]) => [s, e]))
        // Title verses become unnumbered subtitles, i.e. effectively verse 0 of their chapter
        for (const [eref, sref] of Object.entries(data.subtitles)){
            const [ch, last] = sref.slice(4).split(':').map(n => parseInt(n))
            for (let v = 1; v <= last; v++){
                mapped.set(`${book} ${ch}:${v}`, eref)
            }
        }
        const counts = cop[name].maxVerses[book]
        let prev = [0, 0]
        let bad = ''
        for (let ch = 1; ch <= counts.length && !bad; ch++){
            for (let v = 1; v <= parseInt(counts[ch - 1]); v++){
                const sref = `${book} ${ch}:${v}`
                const eref = mapped.get(sref) ?? sref
                const [ec, ev] = eref.slice(4).split(':').map(n => parseInt(n))
                if (ec < prev[0] || (ec === prev[0] && ev < prev[1])){
                    bad = `${eref} (from ${sref}) after ${prev[0]}:${prev[1]}`
                    break
                }
                prev = [ec, ev]
            }
        }
        if (bad){
            console.error(`DROP ${name} ${book}: non-monotonic (${bad})`)
            delete systems[name][book]
        }
    }
}

// Dedupe identical book maps (keep earliest system)
const sig = b => JSON.stringify([b.pairs, b.subtitles])
for (let i = 1; i < order.length; i++){
    for (const book of Object.keys(systems[order[i]])){
        for (let j = 0; j < i; j++){
            const prev = systems[order[j]][book]
            if (prev && sig(prev) === sig(systems[order[i]][book])){
                delete systems[order[i]][book]
                break
            }
        }
    }
}

// Per-book ordering + condition selection
// A ruleset's conditions: refs that exist in its files, at least one absent from eng,
// and for each later-ordered differing system at least one condition absent from its space
const book_rules = {}  // book -> [[system, [refs...]], ...]

// Drop books undetectable vs eng (no ref outside eng's space; e.g. pure verse merges)
for (const name of order){
    for (const [book, data] of Object.entries(systems[name])){
        if (!data.pairs.some(([e, s]) => !exists(cop.eng.maxVerses, s))){
            console.error(`UNDETECTABLE ${name} ${book}: all refs exist in eng, dropping`)
            delete systems[name][book]
        }
    }
}

const all_books = new Set(order.flatMap(n => Object.keys(systems[n])))
for (const book of all_books){
    const remaining = new Set(order.filter(n => systems[n][book]))
    const placed = []
    // Build conditions for a system against a set of others (eng exclusion always required)
    const pick_conds = (name, others, require_all) => {
        const refs = systems[name][book].pairs.map(p => p[1])
        const conds = [refs.findLast(r => !exists(cop.eng.maxVerses, r))]
        for (const target of others){
            if (conds.some(c => !exists(cop[target].maxVerses, c))){
                continue
            }
            const r = refs.findLast(r => !exists(cop[target].maxVerses, r)
                && !exists(cop.eng.maxVerses, r))
                ?? refs.findLast(r => !exists(cop[target].maxVerses, r))
            if (!r){
                if (require_all){
                    return null
                }
                continue  // Best effort; misapplication is caught by validation anyway
            }
            if (!conds.includes(r)){
                conds.push(r)
            }
        }
        return conds
    }
    // Greedily place systems that can fully distinguish themselves from those remaining
    while (remaining.size){
        let placed_one = false
        for (const name of order.filter(n => remaining.has(n))){
            const others = [...remaining].filter(o => o !== name)
            const conds = pick_conds(name, others, true)
            if (conds){
                placed.push([name, conds])
                remaining.delete(name)
                placed_one = true
                break
            }
        }
        if (!placed_one){
            // Ambiguous: keep canonical order with best-effort conditions
            // (a wrong match fails numbering validation, same outcome as no rules)
            for (const name of order.filter(n => remaining.has(n))){
                const others = [...remaining].filter(o => o !== name)
                console.error(`AMBIGUOUS ${name} ${book}: placing in canonical order`)
                placed.push([name, pick_conds(name, others, false)])
                remaining.delete(name)
            }
        }
    }
    if (placed.length){
        book_rules[book] = placed
    }
}

// Emit TS
function compress(pairs){
    const out = []
    let run = null
    const flush = () => {
        if (!run){
            return
        }
        const [[e1, e2], [s1, s2]] = run
        if (e1 === e2){
            out.push(`"${e1}": "${s1}",`)
        } else {
            out.push(`"${e1}-${e2.split(':')[1]}": "${s1}-${s2.split(':')[1]}",`)
        }
        run = null
    }
    for (const [e, s] of pairs){
        const [ec, ev] = e.slice(4).split(':').map(n => parseInt(n))
        const [sc, sv] = s.slice(4).split(':').map(n => parseInt(n))
        if (run){
            const [pec, pev] = run[0][1].slice(4).split(':').map(n => parseInt(n))
            const [psc, psv] = run[1][1].slice(4).split(':').map(n => parseInt(n))
            if (ec === pec && sc === psc && ev === pev + 1 && sv === psv + 1){
                run[0][1] = e
                run[1][1] = s
                continue
            }
            flush()
        }
        run = [[e, e], [s, s]]
    }
    flush()
    return out
}

for (const name of order.slice(1)){
    if (!Object.keys(systems[name]).length){
        continue
    }
    console.log(`\n\nexport const eng_to_${name} = Object.freeze({`)
    for (const [book, data] of Object.entries(systems[name])){
        console.log('')
        for (const [eref, sref] of Object.entries(data.subtitles)){
            console.log(`    "${eref}": "${sref}",`)
        }
        for (const line of compress(data.pairs)){
            console.log(`    ${line}`)
        }
    }
    console.log('})')
}

console.log('\n\n// For each book, the order to test systems in, with refs that must all be')
console.log('// present for that system\'s rules to apply (refs chosen to exclude eng files')
console.log('// and files of any system listed lower)')
console.log('export const book_system_tests:Record<string, [string, string[]][]> = {')
for (const book of BOOKS_66){
    if (book_rules[book]){
        const items = book_rules[book].map(([n, conds]) =>
            `['${n}', [${conds.map(c => `'${c}'`).join(', ')}]]`).join(', ')
        console.log(`    '${book}': [${items}],`)
    }
}
console.log('}')
