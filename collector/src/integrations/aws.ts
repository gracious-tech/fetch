
import {readFileSync} from 'fs'

import {parse as parse_yaml} from 'yaml'
import {S3} from '@aws-sdk/client-s3'
import {CloudFront} from '@aws-sdk/client-cloudfront'

import {CollectionConfig} from '../parts/types'


export class PublisherAWS {

    _s3:S3
    _bucket:string
    _cf:CloudFront
    _cf_id:string

    constructor(){
        // Load config and init clients
        const config =
            (parse_yaml(readFileSync('config.yaml', 'utf-8')) as CollectionConfig).integrations.aws
        this._s3 = new S3({region: config.region})
        this._bucket = config.bucket
        this._cf = new CloudFront({region: config.region})
        this._cf_id = config.cloudfront
    }

    async upload(key:string, body:Buffer|string, type:string){
        // Upload a file to the bucket
        await this._s3.putObject({
            Bucket: this._bucket,
            Key: key,
            Body: body,
            ContentType: type,
        })
    }

    async invalidate(paths:string[]){
        // Request invalidation of given paths in CloudFront

        // If invalidating too many paths, better to just use single wildcard
        // NOTE AWS only gives 1000 free paths (wilcard = 1 path) per month
        if (paths.length > 100){
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
