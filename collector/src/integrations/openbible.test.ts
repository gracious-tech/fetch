
import {describe, it} from 'vitest'

import {cross_references_to_json} from './openbible.js'



const test_data = `From Verse\tTo Verse\tVotes\t#www.openbible.info CC-BY 2023-07-10
Exod.28.3\tEph.1.17\t30
Gen.1.1\tIsa.42.5\t109
Exod.28.2\tZech.3.3-Zech.3.4\t2
Exod.28.3\tDeut.34.9\t103
Exod.28.3\tProv.2.6\t0
Exod.28.4\tEph.1.17\t-1
Exod.28.3\tExod.35.35-Exod.36.2\t32
`


describe('cross_references_to_json', () => {

    const refs = cross_references_to_json(test_data)

    it("Organises references by USX book id", ({expect}) => {
        expect(Object.keys(refs).sort()).toEqual(['gen', 'exo'].sort())
    })

    it("Parses single verse references", ({expect}) => {
        expect(refs['gen']![1]![1]![0]!.slice(1)).toEqual(['isa', 42, 5])
    })

    it("Parses multi-verse references", ({expect}) => {
        expect(refs['exo']![28]![2]![0]!.slice(1)).toEqual(['zec', 3, 3, 3, 4])
    })

    it("Parses multiple references per verse", ({expect}) => {
        expect(refs['exo']![28]![3]).toHaveLength(4)
    })

    it("Sorts references by traditional book ordering", ({expect}) => {
        expect(refs['exo']![28]![3]!.map(r => r[1])).toEqual(['exo', 'deu', 'pro', 'eph'])
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
        expect(relevance_total).toBe(1*2 + 2*2 + 3*2)
    })

})
