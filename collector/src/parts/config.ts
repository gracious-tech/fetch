
import {existsSync, writeFileSync} from 'fs'


// Template for config file
const TEMPLATE = `
integrations:
    dbl:
        token:
        key:
    aws:
        key_id:
        key_secret:
        bucket:
        region:
        cloudfront:
`


export async function init_config(){
    // Create config file if it doesn't exist yet
    const path = 'config.yaml'
    if (!existsSync(path)){
        writeFileSync(path, TEMPLATE)
    }
}
