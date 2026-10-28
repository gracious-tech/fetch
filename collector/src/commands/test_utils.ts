// Shared fixtures for collector command tests

import type {TranslationSourceMeta} from '../parts/types.js'


type Service = TranslationSourceMeta['source']['service']


// A minimal valid translation meta.json for the given source format/service
export function test_meta(format:'usx'|'usfm', service:Service = 'manual',
        extra:Partial<TranslationSourceMeta> = {}):TranslationSourceMeta{
    return {
        name: {local: 'Test', local_abbrev: 'TST', english: 'Test', english_abbrev: 'TST'},
        year: 2000,
        direction: 'ltr',
        copyright: {attribution: 'Owner', attribution_url: 'https://example.com',
            licenses: [{license: 'public', url: ''}]},
        tags: [],
        ids: {},
        source: {service, format, url: null, updated: '2020-01-01', revision: 0},
        ...extra,
    }
}


// A book as USX3 (with verse end markers), with the given number of verses in each chapter
export function usx3_book(code:string, verse_counts:number[]):string{
    const chapters = verse_counts.map((count, i) => {
        const ch = i + 1
        const verses = [...Array(count).keys()]
            .map(v => `<verse style="v" number="${v + 1}" sid="${code} ${ch}:${v + 1}"/>`
                + `Verse ${v + 1}.<verse eid="${code} ${ch}:${v + 1}"/>`)
            .join('')
        return `<chapter style="c" number="${ch}" sid="${code} ${ch}"/>\n`
            + `<para style="p">${verses}</para>\n<chapter eid="${code} ${ch}"/>\n`
    })
    return '<?xml version="1.0" encoding="utf-8"?>\n'
        + `<usx version="3.0"><book style="id" code="${code}">${code}</book>\n`
        + `<para style="h">${code}</para>\n`
        + `<para style="toc1">The Book of ${code}</para>\n`
        + `<para style="toc2">${code}</para>\n`
        + `<para style="toc3">${code}</para>\n`
        + chapters.join('') + '</usx>\n'
}


// Jude 1:1-25 as USX3
export const usx3_jude = usx3_book('JUD', [25])


// Romans with broken numbering that matches a re-versing rule (so reverse_usx warns and throws)
export const usx3_bad_romans = '<usx version="3.0"><book style="id" code="ROM"/>'
    + '<chapter style="c" number="1" sid="ROM 1"/><para style="p">'
    + '<verse style="v" number="1" sid="ROM 1:1"/>One.<verse eid="ROM 1:1"/>'
    + '<verse style="v" number="24" sid="ROM 14:24"/>Bad.<verse eid="ROM 14:24"/>'
    + '</para><chapter eid="ROM 1"/></usx>'
