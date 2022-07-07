
// A script for extracting language population data from DBS data dump at:
// https://github.com/digitalbiblesociety/data/blob/main/languages.json


import {readFileSync, writeFileSync} from 'fs'


const data = JSON.parse(readFileSync('languages.json'))

data.sort((a, b) => b.po - a.po)



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






const pop = data.slice(0, 1000).map(item => {
    return {
        id: item.id,
        pop: recent_data[item.id] ?? item.po,
        english: item.tt,
        local: item.tv,
    }
})


writeFileSync('population.json', JSON.stringify(pop))
