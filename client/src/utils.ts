
// @internal
export async function request(url:string):Promise<string>{
    // Request the text contents of a URL
    // TODO Waiting on fetch types: https://github.com/DefinitelyTyped/DefinitelyTyped/issues/60924
    /* eslint-disable */
    // @ts-ignore Node 18 does have fetch but types not updated yet
    const resp = await fetch(url)
    if (resp.ok){
        return await resp.text()
    }
    throw new Error(`${resp.status} ${resp.statusText}: ${url}`)
    /* eslint-enable */
}


// @internal
export function deep_copy<T extends object>(source:T):T{
    // Deep copy an object that originated from JSON (doesn't handle other edge cases)
    const copy = (Array.isArray(source) ? [] : {}) as T
    for (const key in source){
        const value = source[key]
        // @ts-ignore This util is only for simple JSON objects where as TS accounts for all cases
        copy[key] = (typeof value === 'object' && value !== null) ? deep_copy(value) : value
    }
    return copy
}


// @internal
export function rm_diacritics(string:string):string{
    // Remove diacritics from a string
    // See https://stackoverflow.com/a/37511463/10262211
    return string.normalize('NFKD').replace(/\p{Diacritic}/gu, '')
}


