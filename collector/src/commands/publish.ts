
import {PublisherAWS} from '../integrations/aws.js'
import {update_manifest} from '../parts/manifest.js'


export async function publish(force=false){
    // Regenerate manifest, sync all resources to server, then upload manifest
    await update_manifest()
    const publisher = new PublisherAWS()
    await publisher.publish(force)
}
