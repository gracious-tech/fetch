
import {join} from 'node:path'
import {existsSync, writeFileSync} from 'node:fs'

import {mkdir_exist} from './utils.js'


// Template for config file
const TEMPLATE = `
integrations:
    dbl:
        token:
        key:
    aws:
        bucket:
        region:
        cloudfront:
`


// Create initial config file and sources dirs
export async function init_config(){

    // Create config file if it doesn't exist yet
    const path = 'config.yaml'
    if (!existsSync(path)){
        writeFileSync(path, TEMPLATE)
    }

    // Ensure sources dirs exist
    mkdir_exist('sources')
    mkdir_exist(join('sources', 'bibles'))
    mkdir_exist(join('sources', 'notes'))
    mkdir_exist(join('sources', 'crossref'))
}
