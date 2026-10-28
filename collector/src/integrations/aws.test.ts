
import {join} from 'node:path'

import {describe, it, vi} from 'vitest'
import {DeleteObjectsCommand, ListObjectsV2Command} from '@aws-sdk/client-s3'

import {PublisherAWS} from './aws.js'
import {use_temp_cwd, write_files} from '../parts/test_utils.js'

import type {S3, ListObjectsV2CommandOutput} from '@aws-sdk/client-s3'
import type {CloudFront} from '@aws-sdk/client-cloudfront'


// Create a publisher whose S3/CloudFront clients are fakes (list responses served in order)
function make_publisher(list_pages:Partial<ListObjectsV2CommandOutput>[] = []){
    write_files({'config.yaml':
        'integrations:\n  aws:\n    bucket: bkt\n    region: reg\n    cloudfront: cfid\n'})
    const publisher = new PublisherAWS()
    const send = vi.fn((command:unknown) => Promise.resolve(
        command instanceof ListObjectsV2Command ? list_pages.shift() ?? {} : {}))
    const putObject = vi.fn()
    const createInvalidation = vi.fn()
    publisher._s3 = {send, putObject} as unknown as S3
    publisher._cf = {createInvalidation} as unknown as CloudFront
    return {publisher, send, putObject, createInvalidation}
}


// Inputs of the commands of the given class that were sent
function sent<T>(send:ReturnType<typeof vi.fn>, cls:new (...args:never[]) => {input:T}):T[]{
    return send.mock.calls.map(c => c[0] as unknown).filter(c => c instanceof cls)
        .map(c => (c as {input:T}).input)
}


describe('PublisherAWS', () => {

    use_temp_cwd()

    it("Loads config and generates an index for the bucket", ({expect}) => {
        const {publisher} = make_publisher()
        expect(publisher._bucket).toBe('bkt')
        expect(publisher._region).toBe('reg')
        expect(publisher._cf_id).toBe('cfid')
        expect(publisher.generate_dynamic_index()).toContain('bkt')
    })

    it("Rejects an invalid config", ({expect}) => {
        write_files({'config.yaml': 'integrations:\n  aws:\n    bucket:\n'})
        expect(() => new PublisherAWS()).toThrow('Invalid data from config.yaml')
    })

    it("Uploads with posix keys", async ({expect}) => {
        const {publisher, putObject} = make_publisher()
        await publisher.upload(join('bibles', 'x.json'), 'body', 'application/json')
        expect(putObject).toHaveBeenCalledWith({Bucket: 'bkt', Key: 'bibles/x.json',
            Body: 'body', ContentType: 'application/json'})
    })

    it("Lists immediate subdirs across pages", async ({expect}) => {
        const {publisher, send} = make_publisher([
            {CommonPrefixes: [{Prefix: 'bibles/a/'}, {Prefix: 'bibles/'}, {}],
                NextContinuationToken: 't'},
            {CommonPrefixes: [{Prefix: 'bibles/b/'}]},
            {},
        ])
        expect(await publisher.list_server_dirs('bibles')).toEqual(['a', 'b'])
        expect(await publisher.list_server_dirs('bibles')).toEqual([])
        expect(sent(send, ListObjectsV2Command)).toEqual([
            {Bucket: 'bkt', Prefix: 'bibles/', Delimiter: '/'},
            {Bucket: 'bkt', Prefix: 'bibles/', Delimiter: '/', ContinuationToken: 't'},
            {Bucket: 'bkt', Prefix: 'bibles/', Delimiter: '/'},
        ])
    })

    it("Lists all files across pages", async ({expect}) => {
        const {publisher, send} = make_publisher([
            {Contents: [{Key: 'x/1'}, {}], NextContinuationToken: 't'},
            {Contents: [{Key: 'x/2'}]},
            {},
        ])
        expect(await publisher.list_server_files('x')).toEqual(['x/1', 'x/2'])
        expect(await publisher.list_server_files('x')).toEqual([])
        expect(sent(send, ListObjectsV2Command)[1]).toEqual(
            {Bucket: 'bkt', Prefix: 'x/', ContinuationToken: 't'})
    })

    it("Deletes files in batches of 1000", async ({expect}) => {
        const {publisher, send} = make_publisher()
        const keys = [...Array(1001).keys()].map(i => `k${i}`)
        await publisher.delete_files(keys)
        const batches = sent(send, DeleteObjectsCommand)
        expect(batches.map(b => b.Delete?.Objects?.length)).toEqual([1000, 1])
        expect(batches[1]!.Delete?.Objects).toEqual([{Key: 'k1000'}])
    })

    it("Deletes a dir across pages", async ({expect}) => {
        const {publisher, send} = make_publisher([
            {Contents: [{Key: 'd/1'}, {}], NextContinuationToken: 't'},
            {},
        ])
        await publisher.delete_dir('d')
        expect(sent(send, DeleteObjectsCommand)).toEqual(
            [{Bucket: 'bkt', Delete: {Objects: [{Key: 'd/1'}, {Key: ''}]}}])
        expect(sent(send, ListObjectsV2Command)[1]).toEqual(
            {Bucket: 'bkt', Prefix: 'd/', ContinuationToken: 't'})
    })

    it("Invalidates paths, using a wildcard when there are many", async ({expect}) => {
        const {publisher, createInvalidation} = make_publisher()
        await publisher.invalidate(['/a', '/b'])
        await publisher.invalidate([...Array(13).keys()].map(i => `/${i}`))
        const batches = createInvalidation.mock.calls.map(c => (c[0] as {DistributionId:string,
            InvalidationBatch:{Paths:unknown}}))
        expect(batches[0]!.DistributionId).toBe('cfid')
        expect(batches.map(b => b.InvalidationBatch.Paths)).toEqual([
            {Quantity: 2, Items: ['/a', '/b']},
            {Quantity: 1, Items: ['/*']},
        ])
    })
})

