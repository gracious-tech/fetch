import {describe, it} from 'vitest'
import {TyndaleBibleReference, extract_reference, study_notes_to_json, tyndale_to_usx_book} from './tyndale'

const test_xml = `
<items release="1.25">

<item name="ICor.1.10-15.58" typename="StudyNote" product="TyndaleOpenStudyNotes">
<refs>1Cor.1.10</refs>
<body>
<p class="sn-text"><span class="sn-ref"><a href="?bref=1Cor.1.10-15.58">1:10–15:58</a></span> The body of the letter is devoted to Paul’s advice on specific problems and questions that had arisen in the Corinthian church.</p>
</body>
</item>

<item name="Gen.2.8-14" typename="StudyNote" product="TyndaleOpenStudyNotes">
<refs>Gen.2.8-14</refs>
<body>
<p class="sn-text"><span class="sn-ref"><a href="?bref=Gen.2.8-14">2:8-14</a></span> Analogous to the sacred time marked out on the seventh day of creation (<a href="?bref=Gen.2.2-3">2:2-3</a>), the sacred space of the <span class="sn-excerpt">garden in Eden</span> was separate from the surrounding world. It functioned as a garden-temple or sanctuary because the Lord manifested his presence there in a special way.</p>
</body>
</item>

<item name="Gen.1.3-13" typename="StudyNote" product="TyndaleOpenStudyNotes">
<refs>Gen.1.3-13</refs>
<body>
<p class="sn-text"><span class="sn-ref"><a href="?bref=Gen.1.3-13">1:3-13</a></span> In the first three days, God formed the chaos into a habitable world.</p>
</body>
</item>

<item name="Matt.17.9" typename="StudyNote" product="TyndaleOpenStudyNotes">
<refs>Matt.17.9</refs>
<body>
<p class="sn-text"><span class="sn-ref"><a href="?bref=Matt.17.9">17:9</a></span> Jesus could not be fully understood until all of his work was accomplished, particularly his death and resurrection.</p>
</body>
</item>

<item name="Matt.12.24" typename="StudyNote" product="TyndaleOpenStudyNotes">
<refs>Matt.12.24</refs>
<body>
<p class="sn-text"><span class="sn-ref"><a href="?bref=Matt.12.24">12:24</a></span> <span class="sn-excerpt">Satan:</span> Greek <span class="ital">Beelzeboul;</span> see <a href="?item=Matt.10.25_StudyNote_Filament">study note on 10:25</a>.</p>
</body>
</item>

<item name="IIThes.1.10" typename="StudyNote" product="TyndaleOpenStudyNotes">
<refs>2Thes.1.10</refs>
<body>
<p class="sn-text"><span class="sn-ref"><a href="?bref=2Thes.1.10">1:10</a></span> <span class="sn-excerpt">that day:</span> The day of the Lord (<a href="?bref=2Thes.2.2">2:2</a>; <a href="?bref=1Thes.5.2-4">1 Thes 5:2-4</a>; see “<a href="?item=TheDayOfTheLord_ThemeNote_Filament">The Day of the Lord</a>” Theme Note).</p>
</body>
</item>

</items>
`

describe('study_notes_to_json', () => {

    const notes = study_notes_to_json(test_xml)

    it("Organises notes by USX book id", ({expect}) => {
        expect(Object.keys(notes)).toEqual(Object.values(tyndale_to_usx_book))
    })

    it("Parses singe verse ref", ({expect}) => {
        expect(JSON.stringify(notes['mat']!.verses)).not.toBe('{}')
        expect(notes['mat']!.ranges).toHaveLength(0)
        expect(notes['mat']!.verses[17]![9]).toBeDefined()
        expect(notes['mat']!.verses[17]![9]).toContain('Jesus could not be fully understood')
    })

    it("Parses multi-verse ref (no pun intended)", ({expect}) => {
        expect(JSON.stringify(notes['gen']!.verses)).toBe('{}')
        expect(notes['gen']!.ranges).toHaveLength(2)
        expect(notes['gen']!.ranges.find(note => {
            return note.start_c === 1 && note.start_v === 3 && note.end_c === 1 && note.end_v === 13
        })).toBeDefined()
        expect(notes['gen']!.ranges.find(note => {
            return note.start_c === 2 && note.start_v === 8 && note.end_c === 2 && note.end_v === 14
        })).toBeDefined()
    })

    it("Parses multi-chapter ref", ({expect}) => {
        expect(JSON.stringify(notes['1co']!.verses)).toBe('{}')
        expect(notes['1co']!.ranges).toHaveLength(1)
        expect(notes['1co']!.ranges.find(note => {
            return note.start_c === 1 && note.start_v === 10
                && note.end_c === 15 && note.end_v === 58
        })).toBeDefined()
    })

    it('should sort the ranges by start_c and start_v', ({expect}) => {
        expect(notes['gen']!.ranges).toHaveLength(2)
        expect(notes['gen']!.ranges[0]!.start_c).toEqual(1)
        expect(notes['gen']!.ranges[0]!.start_v).toEqual(3)
        expect(notes['gen']!.ranges[1]!.start_c).toEqual(2)
        expect(notes['gen']!.ranges[1]!.start_v).toEqual(8)
    })

    it("Contents should be trimmed", ({expect}) => {
        expect(notes['mat']!.verses[17]![9]).toMatch(/^[^ \n].*[^ \n]$/)
    })

    // it("Contents shouldn't start with a container or verse ref", ({expect}) => {
    //     expect(notes['mat']!.verses[17]![9]).toMatch(/^Jesus/)
    // })

    // it("Some elements should be converted to standard HTML", ({expect}) => {
    //     expect(notes['mat']!.verses[12]![24]).toContain('<em>Beelzeboul;</em>')
    // })

    // it("Links to outside resources should be stripped", ({expect}) => {
    //     expect(notes['2th']!.verses[1]![10])
    //         .not.toContain('href="?item=TheDayOfTheLord_ThemeNote_Filament"')
    // })

    // it("Links to other verses should be spans with data-ref attribute", ({expect}) => {
    //     expect(notes['2th']!.verses[1]![10])
    //         .toContain('<span data-ref="2th,2,2">2:2</span>')
    // })

    // it("Links to multi-verse passages should include end chapter & verse", ({expect}) => {
    //     expect(notes['2th']!.verses[1]![10])
    //         .toContain('<span data-ref="1th,5,2,5,4">1 Thes 5:2-4</span>')
    // })

})
describe('extract_reference', () => {

    it('should return a single verse correctly', ({expect})  => {
        const reference: TyndaleBibleReference|null = extract_reference('Matt.12.24')
        expect(reference).not.toBeNull()
        expect(reference!.book).toEqual('Matt')
        expect(reference!.usx).toEqual('mat')
        expect(reference!.start_chapter).toEqual(12)
        expect(reference!.start_verse).toEqual(24)
        expect(reference!.end_chapter).toEqual(12)
        expect(reference!.end_verse).toEqual(24)
        expect(reference!.is_range).toBe(false)
    })

    it('should return a few verses in the same chapter', ({expect}) => {
        const reference: TyndaleBibleReference|null = extract_reference('Gen.1.3-13')
        expect(reference).not.toBeNull()
        expect(reference!.book).toEqual('Gen')
        expect(reference!.usx).toEqual('gen')
        expect(reference!.start_chapter).toEqual(1)
        expect(reference!.start_verse).toEqual(3)
        expect(reference!.end_chapter).toEqual(1)
        expect(reference!.end_verse).toEqual(13)
        expect(reference!.is_range).toBe(true)
    })

    it('should handle multiple passages', ({expect}) => {
        const reference: TyndaleBibleReference|null = extract_reference('ICor.1.10-15.58')
        expect(reference).not.toBeNull()
        expect(reference!.book).toEqual('ICor')
        expect(reference!.usx).toEqual('1co')
        expect(reference!.start_chapter).toEqual(1)
        expect(reference!.start_verse).toEqual(10)
        expect(reference!.end_chapter).toEqual(15)
        expect(reference!.end_verse).toEqual(58)
        expect(reference!.is_range).toBe(true)
    })

})
