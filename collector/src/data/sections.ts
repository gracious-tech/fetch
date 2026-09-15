
import {join} from 'node:path'

import {mkdir_exist, read_json, write_json, PKG_PATH} from '../parts/utils.js'
import {add_unpublished} from '../parts/unpublished.js'

import type {DistSectionData} from '../parts/shared_types'


// Copy the committed section stats (importance/popularity) into the collection's dist dir
// NOTE Data is generated separately by `.bin/gen_section_data.ts` (paid model calls)
export function sections_process(){

    // Read the committed source of truth (bundled with the package)
    const data = read_json<DistSectionData>(join(PKG_PATH, 'dist', 'data', 'sections.json'))

    // Strip each section's `reason` as it's only kept in the source for auditability
    const published:DistSectionData = {
        model: data.model,
        generated: data.generated,
        sections: Object.fromEntries(
            Object.entries(data.sections).map(([book, sections]) => [
                book,
                sections.map(({reason, ...stat}) => stat),
            ]),
        ),
    }

    const dir = join('dist', 'sections')
    mkdir_exist(dir)
    write_json(join(dir, 'sections.json'), published)

    console.info(`Wrote section data for ${Object.keys(published.sections).length} books`)
    add_unpublished(['sections'])
}
