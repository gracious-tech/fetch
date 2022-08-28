
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


// @internal
function _fuzzy_match(input:string, candidate:string):number{
    // Simple fuzzy match algorithm for matching input to a single word candidate
    // Returns 0 for perfect match, negative number for possible match, or -Infinity for no match
    // WARN Both input & candidate should be normalized before being passed to this fn

    // Can't match if empty strings
    if (!input || !candidate){
        return -Infinity
    }

    // Keep track of how many chars skipped
    let skipped = 0

    let input_i = 0
    for (let cand_i = 0; cand_i < candidate.length; cand_i++){

        // See if chars match
        if (candidate[cand_i] === input[input_i]){
            input_i++
            if (input_i >= input.length){
                // End of input so report success and subtract points for skips
                return skipped * -1
            }
        } else if (input_i === 0){
            // First letter must match as very rare to get that wrong
            return -Infinity
        } else {
            // Input not matching so consider next candidate char
            skipped++
            if (skipped > 4){
                // Just fail if skip too many chars
                return -Infinity
            }
        }
    }

    // Reached end of candidate but still have more input chars, so fail
    return -Infinity
}


// @internal
export function fuzzy_search<T>(input:string, candidates:T[], cand_to_str:(c:T)=>string):T[]{
    // Return sorted candidates that fuzzy match input

    // Normalize and break input into words
    const input_words = rm_diacritics(input).toLowerCase().trim().split(' ')

    // Generate scores for each candidate and filter out those that don't match enough
    const items = candidates.map(candidate => {

        // Normalize and break candidate str into words
        // WARN Must normalize the same way input is so can match properly
        const cand_words = rm_diacritics(cand_to_str(candidate)).toLowerCase().trim().split(' ')

        // Calculate the score by summing for each input word
        const score = input_words.reduce((prev, item) => {
            // Select the best possible score for the best matching candidate word
            return prev + Math.max(...cand_words.map(cand => _fuzzy_match(item, cand)))
        }, 0)
        return {candidate, score}
    }).filter(item => item.score > -4)

    // Order the candidates by relevance
    items.sort((a, b) => b.score - a.score)

    // Only return the candidates (without score)
    return items.map(item => item.candidate)
}
