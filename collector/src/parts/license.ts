
import {MetaStandardLicense} from './shared_types'


// Standard licenses that multiple translations may use
export const LICENSES:Record<string, MetaStandardLicense> = {
    // NOTE URLs not given as should include version of license (same restrictions between versions)
    'public': {
        name: "Public domain",
        restrictions: {
            forbid_commercial: false,
            forbid_derivatives: false,
            forbid_attributionless: false,
            forbid_limitless: false,
            forbid_other: false,
        },
    },
    'cc-by': {
        name: "CC BY",
        restrictions: {
            forbid_commercial: false,
            forbid_derivatives: false,
            forbid_attributionless: true,
            forbid_limitless: false,
            forbid_other: false,
        },
    },
    'cc-by-sa': {
        name: "CC BY-SA",
        restrictions: {
            forbid_commercial: false,
            forbid_derivatives: 'same-license',
            forbid_attributionless: true,
            forbid_limitless: false,
            forbid_other: false,
        },
    },
    'cc-by-nc': {
        name: "CC BY-NC",
        restrictions: {
            forbid_commercial: true,
            forbid_derivatives: false,
            forbid_attributionless: true,
            forbid_limitless: false,
            forbid_other: false,
        },
    },
    'cc-by-nc-sa': {
        name: "CC BY-NC-SA",
        restrictions: {
            forbid_commercial: true,
            forbid_derivatives: 'same-license',
            forbid_attributionless: true,
            forbid_limitless: false,
            forbid_other: false,
        },
    },
    'cc-by-nd': {
        name: "CC BY-ND",
        restrictions: {
            forbid_commercial: false,
            forbid_derivatives: true,
            forbid_attributionless: true,
            forbid_limitless: false,
            forbid_other: false,
        },
    },
    'cc-by-nc-nd': {
        name: "CC BY-NC-ND",
        restrictions: {
            forbid_commercial: true,
            forbid_derivatives: true,
            forbid_attributionless: true,
            forbid_limitless: false,
            forbid_other: false,
        },
    },
}


// Detect a license from a Creative Commons URL, returning normalized form with trailing slash
export function license_from_url(url:string):{license:string, url:string}|null {

    // Strip non-ASCII characters (e.g. Unicode directional/formatting chars like U+202A that can
    // appear in URLs scraped from ebible, making the URL technically invalid)
    url = url.replace(/[^\x20-\x7E]/g, '')

    // Normalize to https with trailing slash
    const normalized = url.replace(/^http:/, 'https:').replace(/\/?$/, '/')

    // CC license e.g. https://creativecommons.org/licenses/by-sa/4.0/
    const cc_match = /creativecommons\.org\/licenses\/(by[a-z-]*)\//i.exec(normalized)
    if (cc_match){
        const conditions = cc_match[1]!.toLowerCase()
        const license = `cc-${conditions}`
        if (license in LICENSES){
            return {license, url: normalized}
        }
    }

    // Public domain e.g. https://creativecommons.org/publicdomain/zero/1.0/
    if (/creativecommons\.org\/publicdomain\/zero\//i.test(normalized)){
        return {license: 'public', url: normalized}
    }

    return null
}


// Scan arbitrary text for a license — checks for CC/CC0 URLs first, then public domain language.
// Returns url as empty string when license is inferred from text only (no URL found).
export function license_from_text(text:string):{license:string, url:string}|null {

    // Prefer URL-based detection as it is more precise
    const url_match =
        /https?:\/\/creativecommons\.org\/(?:licenses|publicdomain)\/[^\s"'<>]+/i.exec(text)
    if (url_match){
        const detected = license_from_url(url_match[0])
        if (detected){
            return detected
        }
    }

    // Fall back to text-based public domain detection
    if (/public domain/i.test(text) && !/not public domain/i.test(text)){
        return {license: 'public', url: ''}
    }

    return null
}


export function detect_year(...sources:string[]):number|null{
    // Detect the most likely year of publication (most reliable sources to be first in list)
    for (const source of sources){

        // Find all candidates in the source
        const candidates:number[] = []
        // NOTE regex ensures 4 digits are not next to any other digits
        for (const match of source.matchAll(/^(?:.*[^\d])?(\d\d\d\d)(?:[^\d].*)?$/gm)){
            candidates.push(parseInt(match[1]!))
        }

        // Return lowest number (if any) which will be the publication year (rather than revision)
        if (candidates.length){
            return Math.min(...candidates)
        }
    }
    return null
}
