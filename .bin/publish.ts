#!/usr/bin/env node

// Publish site (needs AWS credentials in env vars)

import {join} from 'path'
import {argv} from 'process'
import {readFileSync, readdirSync, statSync} from 'fs'

import yaml from 'yaml'
import MimeTypes from 'mime-types'
import {S3} from '@aws-sdk/client-s3'
import {CloudFront} from '@aws-sdk/client-cloudfront'


const DONT_PUBLISH = ['.npmignore']


async function concurrent(tasks:(()=>Promise<unknown>)[], limit=10):Promise<void>{
    // Complete the given tasks concurrently and return promise that resolves when all done
    // NOTE Upon failure this will reject and stop starting tasks (though some may still be ongoing)

    // Create an array to represent channels and default to already resolved promises
    // NOTE Any promises added to channels must resolve to the channel id (array index)
    const channels = [...Array(limit).keys()].map(i => Promise.resolve(i))

    // Add tasks to channels whenever one free
    for (const task of tasks){
        // Wait till at least one channel is free
        const free_channel = await Promise.race(channels)
        channels[free_channel] = task().then(() => {
            // Return channel so next task knows which is free
            return free_channel
        })
    }

    // Wait till all the tasks have been completed
    await Promise.all(channels)
}


function get_files(dir:string):string[]{
    // Get paths for all files in dir (deep)
    const files:string[] = []
    for (const name of readdirSync(dir)){
        const path = `${dir}/${name}`
        if (statSync(path).isDirectory()){
            files.push(...get_files(path))
        } else if (!DONT_PUBLISH.includes(name)){
            files.push(path)
        }
    }
    return files
}


// Load config
let domain = argv[1]
if (!domain){
    const domains = readdirSync('.deployments')
    if (domains.length === 1){
        domain = domains[0].slice(0, -5)
    } else {
        throw new Error("Pass domain name as first arg")
    }
}
const config = yaml.parse(readFileSync(join('.deployments', `${domain}.yaml`), 'utf-8')) as
    {bucket:string, dist:string, region?:string}
config.region = config.region || 'us-west-2'

// Init clients
const s3 = new S3({region: config.region})
const cf = new CloudFront({region: 'us-east-1'})


// Upload all files
const new_keys:string[] = []
await concurrent(get_files('dist').map(file => async () => {

    // For index files that aren't at root, upload to the dir key (stripping index.html)
    let key = file.slice('dist/'.length)
    if (key.endsWith('index.html') && key !== 'index.html'){
        key = key.slice(0, 'index.html'.length * -1)
    }
    new_keys.push(key)

    // Detect mime type
    const mime = MimeTypes.lookup(file)
    if (!mime || typeof mime !== 'string'){
        throw new Error(`Don't know mimetype for ${file}`)
    }

    // Upload
    s3.putObject({
        Bucket: config.bucket,
        Key: key,
        Body: readFileSync(file),
        ContentType: mime,
    })
}))


// Delete old
const existing = await s3.listObjectsV2({Bucket: config.bucket})
const delete_objects = existing.Contents!.map(item => ({Key: item.Key!}))
    .filter(item => !new_keys.includes(item.Key))
if (delete_objects.length){
    await s3.deleteObjects({Bucket: config.bucket, Delete: {Objects: delete_objects}})
}


// Invalidate all paths
await cf.createInvalidation({DistributionId: config.dist, InvalidationBatch: {
    CallerReference: new Date().getTime().toString(),
    Paths: {
        Quantity: 1,
        Items: ['/*'],
    },
}})
