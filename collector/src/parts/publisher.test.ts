
import {existsSync} from 'node:fs'

import {describe, it, vi, beforeEach} from 'vitest'

import {Publisher} from './publisher.js'
import {LICENSES} from './license.js'
import {read_unpublished} from './unpublished.js'
import {use_temp_cwd, write_files} from './test_utils.js'

import type {DistManifest, DistManifestItem} from './shared_types'


// A publisher that records calls and serves a fake server listing
class FakePublisher extends Publisher {

    uploads:Record<string, string> = {}
    invalidated:string[] = []
    deleted_dirs:string[] = []
    deleted_files:string[] = []
    server_dirs:Record<string, string[]> = {}
    server_files:Record<string, string[]> = {}

    async upload(key:string, body:Buffer|string, type:string){
        this.uploads[key] = `${type}:${body.toString()}`
    }
    async invalidate(paths:string[]){
        this.invalidated.push(...paths)
    }
    async delete_dir(path:string){
        this.deleted_dirs.push(path)
    }
    async delete_files(keys:string[]){
        this.deleted_files.push(...keys)
    }
    async list_server_dirs(prefix:string){
        return this.server_dirs[prefix] ?? []
    }
    async list_server_files(prefix:string){
        return this.server_files[prefix] ?? []
    }
    generate_dynamic_index(){
        return '<html>'
    }
}


// A valid manifest item
const item:DistManifestItem = {
    name: {local: "Local", local_abbrev: "LOC", english: "English", english_abbrev: "ENG"},
    year: 2000,
    books_ot: true,
    books_nt: true,
    copyright: {attribution: "Someone", attribution_url: '',
        licenses: [{license: 'cc-by', url: ''}]},
    direction: 'ltr',
    tags: [],
}

// A valid manifest with the given bibles
function manifest(bible_ids:string[]):DistManifest{
    return {
        bibles: Object.fromEntries(bible_ids.map(id => [id, item])),
        glosses: {},
        notes: {},
        languages: {eng: {local: "English", english: "English", pop: 1, direction: 'ltr'}},
        language2to3: {en: 'eng'},
        languages_most_spoken: ['eng'],
        books_ordered: ['gen'],
        book_names_english: {gen: "Genesis"},
        licenses: {'cc-by': LICENSES['cc-by']!},
    }
}


describe('Publisher', () => {

    use_temp_cwd()
    let publisher:FakePublisher

    beforeEach(() => {
        publisher = new FakePublisher()
        vi.spyOn(console, 'info').mockImplementation(() => undefined)
    })

    it("Uploads a dir and deletes remote files no longer present locally", async ({expect}) => {
        write_files({'dist/bibles/eng_a/usx/gen.usx': '<usx/>', 'dist/bibles/eng_a/a.json': {}})
        publisher.server_files['bibles/eng_a'] = ['bibles/eng_a/a.json', 'bibles/eng_a/old.json']
        await publisher.upload_dir('dist/bibles/eng_a')
        expect(publisher.uploads).toEqual({
            'bibles/eng_a/usx/gen.usx': 'application/xml:<usx/>',
            'bibles/eng_a/a.json': 'application/json:{}',
        })
        expect(publisher.deleted_files).toEqual(['bibles/eng_a/old.json'])
    })

    it("Doesn't delete anything when the server has no stale files", async ({expect}) => {
        write_files({'dist/notes/x/a.json': {}})
        await publisher.upload_dir('dist/notes/x')
        expect(publisher.deleted_files).toEqual([])
    })

    it("Uploads the manifest minified and to the legacy location", async ({expect}) => {
        write_files({'dist/manifest.json': JSON.stringify({bibles: {}}, undefined, 4)})
        expect(await publisher.publish_manifest())
            .toEqual(['/manifest.json', '/bibles/manifest.json'])
        expect(publisher.uploads).toEqual({
            'manifest.json': 'application/json:{"bibles":{}}',
            'bibles/manifest.json': 'application/json:{"translations":{}}',
        })
    })

    it("Publishes changes, skips non-resources and reconciles orphans", async ({expect}) => {
        write_files({
            'dist/manifest.json': manifest(['eng_a', 'eng_gone']),
            'dist/bibles/eng_a/a.json': {},
            'dist/descriptions/bibles/eng.json': {},
            'unpublished.txt': ['.git', 'bibles/eng_bad', 'bibles/eng_a', 'bibles/eng_gone',
                'descriptions/bibles'].join('\n'),
        })
        publisher.server_dirs['bibles'] = ['eng_a', 'eng_orphan']
        await publisher.publish()

        expect(Object.keys(publisher.uploads).sort()).toEqual(['_dynamic_index.html',
            'bibles/eng_a/a.json', 'bibles/manifest.json', 'descriptions/bibles/eng.json',
            'manifest.json'])
        expect(publisher.deleted_dirs).toEqual(['bibles/eng_gone', 'bibles/eng_orphan'])
        expect(publisher.invalidated).toEqual([
            '/bibles/eng_a/*', '/bibles/eng_gone/*', '/descriptions/bibles/*',
            '/bibles/eng_orphan/*', '/bibles/', '/descriptions/', '/manifest.json',
            '/bibles/manifest.json', '/_dynamic_index.html', '/',
        ])
        expect(existsSync('unpublished.txt')).toBe(false)
    })

    it("Only refreshes the manifest when nothing is unpublished", async ({expect}) => {
        write_files({'dist/manifest.json': manifest([])})
        await publisher.publish()
        expect(publisher.invalidated).toEqual(
            ['/manifest.json', '/bibles/manifest.json', '/_dynamic_index.html', '/'])
    })

    it("Republishes everything in dist when forced", async ({expect}) => {
        write_files({'dist/manifest.json': manifest(['eng_a']), 'dist/bibles/eng_a/a.json': {}})
        const upload_dir = vi.spyOn(publisher, 'upload_dir')
        await publisher.publish(true)
        expect(upload_dir).toHaveBeenCalledWith('dist/bibles/eng_a')
        expect(read_unpublished()).toEqual([])
    })

    it("Leaves remaining entries tracked if publishing fails midway", async ({expect}) => {
        write_files({
            'dist/manifest.json': manifest(['eng_a', 'eng_b']),
            'dist/bibles/eng_a/a.json': {},
            'dist/bibles/eng_b/b.json': {},
            'unpublished.txt': 'bibles/eng_a\nbibles/eng_b\n',
        })
        vi.spyOn(publisher, 'upload_dir')
            .mockResolvedValueOnce(undefined)
            .mockRejectedValueOnce(new Error("network"))
        await expect(publisher.publish()).rejects.toThrow("network")
        expect(read_unpublished()).toEqual(['bibles/eng_b'])
    })
})

