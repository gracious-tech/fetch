import {describe, it} from 'vitest'
import {
    extract_reference, OBBibleReference, cross_references_to_json, openbible_to_usx_book,
    calculate_relevance,
} from './openbible.js'



const test_data = `From Verse\tTo Verse\tVotes\t#www.openbible.info CC-BY 2023-07-10
Exod.28.3\tEph.1.17\t30
Gen.1.1\tIsa.42.5\t109
Exod.28.2\tZech.3.3-Zech.3.4\t2
Exod.28.3\tDeut.34.9\t103
Exod.28.3\tDeut.33.3\t10
Exod.28.3\tDeut.33.1\t1
Exod.28.3\tProv.2.6\t0
Exod.28.4\tEph.1.17\t-1
Exod.28.3\tExod.35.35-Exod.36.2\t32
`


describe('cross_references_to_json', () => {

    const refs = cross_references_to_json(test_data)

    it("Organises references by USX book id", ({expect}) => {
        expect(Object.keys(refs)).toEqual(Object.values(openbible_to_usx_book))
    })

    it("Parses single verse references", ({expect}) => {
        expect(refs['gen']![1]![1]![0]!.slice(1)).toEqual(['isa', 42, 5])
    })

    it("Parses multi-verse references", ({expect}) => {
        expect(refs['exo']![28]![2]![0]!.slice(1)).toEqual(['zec', 3, 3, 3, 4])
    })

    it("Parses multiple references per verse", ({expect}) => {
        expect(refs['exo']![28]![3]).toHaveLength(6)
    })

    it("Sorts references by traditional book ordering, chapter, and verse", ({expect}) => {
        expect(refs['exo']![28]![3]!.map(r => r[1]))
            .toEqual(['exo', 'deu', 'deu', 'deu', 'pro', 'eph'])
        const duet = refs['exo']![28]![3]!.filter(r => r[1] === 'deu')
        // Chapters in correct order
        expect(duet.map(r => r[2])).toEqual([33, 33, 34])
        // Verses in order
        const chap_33 = duet.filter(r => r[2] === 33)
        expect(chap_33.map(r => r[3])).toEqual([1, 3])
    })

    it("Excludes references with a negative vote count", ({expect}) => {
        expect(refs['exo']![28]![4]).not.toBeDefined()
    })

    it("Divides references into 3 classes of relevance", ({expect}) => {
        let relevance_total = 0
        for (const book of Object.values(refs)){
            for (const chapter of Object.values(book)){
                for (const verse of Object.values(chapter)){
                    for (const reference of verse){
                        const relevance = reference[0]
                        expect(relevance).toBeGreaterThanOrEqual(1)
                        expect(relevance).toBeLessThanOrEqual(3)
                        relevance_total += relevance
                    }
                }
            }
        }
        // The 6 test references should be divided into 3 classes roughly equally
        expect(relevance_total).toBe(1*2 + 2*3 + 3*3)
    })

})
describe('export_reference', () => {

    it('should return a single verse correctly', ({expect}) => {
        const reference: OBBibleReference|null = extract_reference('Esth.1.20')
        expect(reference).not.toBeNull()
        expect(reference!.book).toEqual('Esth')
        expect(reference!.usx).toEqual('est')
        expect(reference!.start_chapter).toEqual(1)
        expect(reference!.start_verse).toEqual(20)
        expect(reference!.end_chapter).toEqual(1)
        expect(reference!.end_verse).toEqual(20)
        expect(reference!.is_range).toBe(false)
    })

    it('should return a few verses in the same chapter', ({expect}) => {
        const reference: OBBibleReference|null = extract_reference('Mic.4.9-Mic.4.10')
        expect(reference).not.toBeNull()
        expect(reference!.book).toEqual('Mic')
        expect(reference!.usx).toEqual('mic')
        expect(reference!.start_chapter).toEqual(4)
        expect(reference!.start_verse).toEqual(9)
        expect(reference!.end_chapter).toEqual(4)
        expect(reference!.end_verse).toEqual(10)
        expect(reference!.is_range).toBe(true)
    })

})
