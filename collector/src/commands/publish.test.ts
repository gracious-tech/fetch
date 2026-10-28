
import {describe, it, vi} from 'vitest'

import {publish} from './publish.js'
import {update_manifest} from '../parts/manifest.js'


// Mock the manifest update and AWS publisher (no real I/O or network)
vi.mock('../parts/manifest.js', () => ({update_manifest: vi.fn()}))
const publish_aws = vi.hoisted(() => vi.fn())
vi.mock('../integrations/aws.js', () => ({
    PublisherAWS: class {
        publish = publish_aws
    },
}))


describe('publish', () => {

    it("Updates manifest then publishes via AWS", async ({expect}) => {
        await publish(true)
        expect(update_manifest).toHaveBeenCalledOnce()
        expect(publish_aws).toHaveBeenCalledWith(true)
        await publish()
        expect(publish_aws).toHaveBeenLastCalledWith(false)
    })
})

