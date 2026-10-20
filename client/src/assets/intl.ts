
// Intl features newer than the ES2019 lib, so declared as possibly existing
interface IntlModern {
    DisplayNames?:{
        new (locales:string[], options:{type:'script', fallback:'none'}):{
            of(code:string):string|undefined
        }
        supportedLocalesOf(locales:string[]):string[]
    }
    Locale?:new (tag:string) => {maximize():{script?:string}}
}
const intl = Intl as unknown as IntlModern


// @internal Get the name of a script in the given locale (falls back to English, then the code)
export function script_name(script:string, locale:string):string{
    if (!intl.DisplayNames){
        return script
    }
    for (const tag of [locale, 'en']){
        // Avoid locales without own data as would otherwise fall back to the runtime's default
        if (intl.DisplayNames.supportedLocalesOf([tag]).length){
            const name = new intl.DisplayNames([tag], {type: 'script', fallback: 'none'}).of(script)
            if (name){
                return name
            }
        }
    }
    return script
}


// @internal Get the script most likely used for a language tag (e.g. 'zh-TW' -> 'Hant')
export function likely_script(tag:string):string|undefined{
    if (!intl.Locale){
        return undefined
    }
    try {
        return new intl.Locale(tag).maximize().script
    } catch {
        return undefined  // Invalid tag
    }
}

