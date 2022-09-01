
// A script for extracting language population data from DBS data dump

import {dirname, join} from 'path'
import {fileURLToPath} from 'node:url'
import {writeFileSync} from 'fs'


// Get project path
const project = dirname(dirname(fileURLToPath(import.meta.url)))


// Download data
const url = 'https://raw.githubusercontent.com/digitalbiblesociety/data/main/languages.json'
const resp = await fetch(url)
let data = await resp.json()


// More recent data (2022) for the major languages from Wikipedia
const recent_data = {
    cmn: 929000000,
    spa: 474700000,
    eng: 372900000,
    arb: 350000000,
    hin: 343900000,
    ben: 233700000,
    por: 232400000,
    rus: 154000000,
    jpn: 125000000,
    mar: 83100000,
    tel: 82000000,
    wuu: 81400000,
    pan: 80500000,
    tur: 79400000,
    kor: 81700000,
    fra: 79900000,
    msa: 77000000,
    deu: 76100000,
    vie: 84600000,
    tam: 75000000,
}


// Convert to object with desired props
data = Object.fromEntries(data.map(item => {
    return [item.id, {
        pop: recent_data[item.id] ?? item.po ?? 0,
        // Names used when identifying languages missing from collection
        english: item.tt || item.tv,
        local: item.tv || item.tt,
    }]
}))


// Save data to file in site
writeFileSync(join(project, 'site', 'src', '.comp', 'population.json'), JSON.stringify(data))
writeFileSync(join(project, 'collector', 'src', 'data', 'population.json'), JSON.stringify(data))


// Also report how much of world's population is included by selecting first x languages
const world_pop = Object.values(data).reduce((prev, item) => prev + item.pop, 0)
console.log(`World population: ${world_pop}`)
const sorted = Object.values(data)
    .sort((a, b) => b.pop - a.pop)
    .map(item => item.pop)

for (let range = 10; range < 1000; range += 10){
    console.log(range,
        sorted.slice(0, range).reduce((prev, item) => prev + item, 0) / world_pop * 100)
}
