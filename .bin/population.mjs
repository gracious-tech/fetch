
// A script for extracting language population data from DBS data dump at:
// https://github.com/digitalbiblesociety/data/blob/main/languages.json


import {readFileSync, writeFileSync} from 'fs'


// Load data from the file
const data = JSON.parse(readFileSync('languages.json'))


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


// Extract only the population data
const population = {}
for (const item of data){
    const pop = recent_data[item.id] ?? item.po
    // Don't include if no pop data or less than 1000 (to reduce size)
    if (pop && pop >= 1000){
        population[item.id] = pop
    }
}


// Save to new file
writeFileSync('population.json', JSON.stringify(population))
