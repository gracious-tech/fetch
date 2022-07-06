
import {join} from 'path'
import {renameSync, rmSync, writeFileSync} from 'fs'

import StreamZip from 'node-stream-zip'

import {clean_dir, PKG_PATH, request} from './utils.js'


export async function update_bmc(version='0.0.8'){
    // Update copy of Bible Multi Converter stored in package's dir

    // Paths
    const dir = join(PKG_PATH, 'bmc')
    const zip_path = join(dir, 'download.zip')
    const url = `https://github.com/schierlm/BibleMultiConverter/releases/download/`
        + `v${version}/BibleMultiConverter-SWORDEdition-${version}.zip`

    // Remove existing
    clean_dir(dir)

    // Download zip
    // TODO stream
    const zip = await request(url, 'arrayBuffer')
    writeFileSync(zip_path, Buffer.from(zip))

    // Extract files
    await new StreamZip.async({file: zip_path}).extract(null, dir)
    rmSync(zip_path)
    renameSync(
        join(dir, 'BibleMultiConverter-SWORDEdition.jar'),
        join(dir, 'BibleMultiConverter.jar'),
    )
}
