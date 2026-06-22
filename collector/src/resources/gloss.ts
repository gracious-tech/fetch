
import {existsSync} from 'node:fs'
import {join} from 'node:path'

import * as gbt from '../integrations/gbt.js'
import {update_manifest} from '../parts/manifest.js'
import {add_unpublished} from '../parts/unpublished.js'
import {list_dirs_if} from '../parts/utils.js'


// At the moment only have support for Global Bible Tools glosses, so pretty simple...
export async function update_glosses(redownload:boolean){
    if (!existsSync(gbt.gbt_source_dir) || redownload){
        await gbt.download_glosses()
    }
    await gbt.sources_to_dist()

    // Mark all gloss IDs and search dirs as unpublished
    add_unpublished([
        ...list_dirs_if(join('dist', 'glosses')).map(id => `glosses/${id}`),
        'search/ot_gbt',
        'search/nt_gbt',
    ])

    // Update manifest whenever dist files change
    await update_manifest()
}
