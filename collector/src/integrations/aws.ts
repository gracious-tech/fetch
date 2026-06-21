
import {sep} from 'node:path'
import {readFileSync} from 'node:fs'

import {parse as parse_yaml} from 'yaml'
import {S3, ListObjectsV2Command, DeleteObjectsCommand} from '@aws-sdk/client-s3'
import {CloudFront} from '@aws-sdk/client-cloudfront'

import {Publisher} from '../parts/publisher.js'
import {generate_dir_index_content} from '../parts/indexes.js'

import type {CollectionConfig} from '../parts/types'


export class PublisherAWS extends Publisher {

    _s3:S3
    _bucket:string
    _region:string
    _cf:CloudFront
    _cf_id:string

    constructor(){
        super()
        // Load config and init clients
        const config =
            (parse_yaml(readFileSync('config.yaml', 'utf-8')) as CollectionConfig).integrations.aws
        this._s3 = new S3({region: config.region})
        this._bucket = config.bucket
        this._region = config.region
        this._cf = new CloudFront({region: config.region})
        this._cf_id = config.cloudfront
    }

    override async upload(key:string, body:Buffer|string, type:string){
        // Upload a file to the bucket
        await this._s3.putObject({
            Bucket: this._bucket,
            Key: key.replaceAll(sep, '/'),
            Body: body,
            ContentType: type,
        })
    }

    override generate_dynamic_index():string{
        // Generate the S3 API-powered directory index page for this bucket
        return generate_dir_index_content(this._bucket, this._region)
    }

    override async list_server_dirs(prefix:string):Promise<string[]>{
        // List immediate "subdirectory" names under the given prefix using a delimiter
        const dirs:string[] = []
        let continuation_token:string|undefined
        do {
            const response = await this._s3.send(new ListObjectsV2Command({
                Bucket: this._bucket,
                Prefix: `${prefix}/`,
                Delimiter: '/',
                ...(continuation_token && {ContinuationToken: continuation_token}),
            }))
            for (const common_prefix of response.CommonPrefixes ?? []){
                // Strip the leading prefix and trailing slash to get the bare id
                const id = (common_prefix.Prefix ?? '').slice(`${prefix}/`.length).replace(/\/$/, '')
                if (id){
                    dirs.push(id)
                }
            }
            continuation_token = response.NextContinuationToken
        } while (continuation_token)
        return dirs
    }

    override async list_server_files(prefix:string):Promise<string[]>{
        // List all object keys under the given prefix (recursive, paginated)
        const keys:string[] = []
        let continuation_token:string|undefined
        do {
            const response = await this._s3.send(new ListObjectsV2Command({
                Bucket: this._bucket,
                Prefix: `${prefix}/`,
                ...(continuation_token && {ContinuationToken: continuation_token}),
            }))
            for (const obj of response.Contents ?? []){
                if (obj.Key){
                    keys.push(obj.Key)
                }
            }
            continuation_token = response.NextContinuationToken
        } while (continuation_token)
        return keys
    }

    override async delete_files(keys:string[]):Promise<void>{
        // Delete the given object keys in batches (S3 allows up to 1000 per request)
        for (let i = 0; i < keys.length; i += 1000){
            await this._s3.send(new DeleteObjectsCommand({
                Bucket: this._bucket,
                Delete: {Objects: keys.slice(i, i + 1000).map(key => ({Key: key}))},
            }))
        }
    }

    override async delete_dir(server_path:string):Promise<void>{
        // Delete all objects on S3 under the given path prefix (paginated)
        let continuation_token:string|undefined
        do {
            const response = await this._s3.send(new ListObjectsV2Command({
                Bucket: this._bucket,
                Prefix: `${server_path}/`,
                ...(continuation_token && {ContinuationToken: continuation_token}),
            }))
            const keys = (response.Contents ?? []).map(o => ({Key: o.Key ?? ''}))
            if (keys.length){
                await this._s3.send(new DeleteObjectsCommand({
                    Bucket: this._bucket,
                    Delete: {Objects: keys},
                }))
            }
            continuation_token = response.NextContinuationToken
        } while (continuation_token)
    }

    override async invalidate(paths:string[]){
        // Request invalidation of given paths in CloudFront

        // If invalidating too many paths, better to just use single wildcard
        // NOTE AWS only gives 1000 free paths (wilcard = 1 path) per month
        // NOTE AWS only allows 15 wildcard paths at one time
        if (paths.length > 12){
            paths = ['/*']
        }

        await this._cf.createInvalidation({DistributionId: this._cf_id, InvalidationBatch: {
            CallerReference: new Date().getTime().toString(),
            Paths: {
                Quantity: paths.length,
                Items: paths,
            },
        }})
    }
}
