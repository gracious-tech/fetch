
import {UsageConfig, RuntimeLicense} from './types.js'


// @internal
export function filter_licenses(licenses:RuntimeLicense[], usage:UsageConfig):RuntimeLicense[]{
    // Filter licenses so only those that are compatible with intended use are present
    return licenses.filter(license => {
        const r = license.restrictions
        return (
            (!usage.commercial || !r.forbid_commercial)
            && (!usage.attributionless || !r.forbid_attributionless)
            && (!usage.derivatives || !r.forbid_derivatives || usage.derivatives === 'same-license'
                && r.forbid_derivatives === 'same-license')
            && (!usage.limitless
                || (!r.limit_verses && !r.limit_book_ratio && !r.limit_content_ratio))
        )
    })
}
