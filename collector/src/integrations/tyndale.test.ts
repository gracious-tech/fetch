

import {describe, it} from 'vitest'

import {study_notes_to_json} from './tyndale'


const test_xml = `
<items release="1.25">

<item name="ICor.1.10-15.58" typename="StudyNote" product="TyndaleOpenStudyNotes">
<refs>1Cor.1.10</refs>
<body>
<p class="sn-text"><span class="sn-ref"><a href="?bref=1Cor.1.10-15.58">1:10–15:58</a></span> The body of the letter is devoted to Paul’s advice on specific problems and questions that had arisen in the Corinthian church.</p>
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
        expect(Object.keys(notes).sort()).toEqual(['1co', 'gen', 'mat', '2th'].sort())
    })

    it("Parses singe verse ref", ({expect}) => {
        expect(notes['mat']!.verses[17]![9]).toBeDefined()
    })

    it("Parses multi-verse ref (no pun intended)", ({expect}) => {
        expect(notes['gen']!.ranges.find(note => {
            return note.start_c === 1 && note.start_v === 3 && note.end_c === 1 && note.end_v === 13
        })).toBeDefined()
    })

    it("Parses multi-chapter ref", ({expect}) => {
        expect(notes['1co']!.ranges.find(note => {
            return note.start_c === 1 && note.start_v === 10
                && note.end_c === 15 && note.end_v === 58
        })).toBeDefined()
    })

    it("Contents should be trimmed", ({expect}) => {
        expect(notes['mat']!.verses[17]![9]).toMatch(/^[^ \n].*[^ \n]$/)
    })

    it("Contents shouldn't start with a container or verse ref", ({expect}) => {
        expect(notes['mat']!.verses[17]![9]).toMatch(/^Jesus/)
    })

    it("Some elements should be converted to standard HTML", ({expect}) => {
        expect(notes['mat']!.verses[12]![24]).toContain('<em>Beelzeboul;</em>')
    })

    it("Links to outside resources should be stripped", ({expect}) => {
        expect(notes['2th']!.verses[1]![10])
            .not.toContain('href="?item=TheDayOfTheLord_ThemeNote_Filament"')
    })

    it("Links to other verses should be spans with data-ref attribute", ({expect}) => {
        expect(notes['2th']!.verses[1]![10])
            .toContain('<span data-ref="2th,2,2">2:2</span>')
    })

    it("Links to multi-verse passages should include end chapter & verse", ({expect}) => {
        expect(notes['2th']!.verses[1]![10])
            .toContain('<span data-ref="1th,5,2,5,4">1 Thes 5:2-4</span>')
    })

})
