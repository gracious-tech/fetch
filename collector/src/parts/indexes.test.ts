import {describe, it} from 'vitest'

import {generate_dir_index_content} from './indexes'


describe('generate_dir_index_content', () => {

    const html = generate_dir_index_content('my-bucket', 'us-east-1')
    const actual = html.toLowerCase()

    it("Returns a HTML string", ({expect}) => {
        expect(actual).toContain('<!doctype html>')
        expect(actual).toContain('<html>')
        expect(actual).toContain('</html>')
    })

    it("Embeds the bucket and region for client-side use", ({expect}) => {
        expect(html).toContain("const BUCKET = 'my-bucket'")
        expect(html).toContain("const REGION = 'us-east-1'")
    })

    it("Contains the elements the client-side script renders into", ({expect}) => {
        expect(actual).toContain('id="breadcrumbs"')
        expect(actual).toContain('id="status"')
        expect(actual).toContain('id="content"')
    })

})
