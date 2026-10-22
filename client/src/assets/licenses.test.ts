
import {describe, it} from 'vitest'

import {filter_licenses} from './licenses.js'

import type {MetaRestrictions} from './shared_types.js'
import type {RuntimeLicense, UsageConfig} from './types.js'


// A license with the given restrictions (others unrestricted)
function license(id:string, restrictions:Partial<MetaRestrictions>={}):RuntimeLicense{
    return {id, name: id, url: '', restrictions: {forbid_limitless: false,
        forbid_commercial: false, forbid_derivatives: false, forbid_attributionless: false,
        forbid_other: false, ...restrictions}}
}

const none:UsageConfig = {commercial: false, attributionless: false, derivatives: false,
    limitless: false}

const licenses = [
    license('open'),
    license('nc', {forbid_commercial: true}),
    license('by', {forbid_attributionless: true}),
    license('nd', {forbid_derivatives: true}),
    license('sa', {forbid_derivatives: 'same-license'}),
    license('limited', {forbid_limitless: true}),
]
const ids = (usage:UsageConfig) => filter_licenses(licenses, usage).map(l => l.id)


describe('filter_licenses', () => {

    it("Keeps everything when no permissions are needed", ({expect}) => {
        expect(ids(none)).toEqual(['open', 'nc', 'by', 'nd', 'sa', 'limited'])
    })

    it("Removes licenses forbidding each intended use", ({expect}) => {
        expect(ids({...none, commercial: true})).not.toContain('nc')
        expect(ids({...none, attributionless: true})).not.toContain('by')
        expect(ids({...none, limitless: true})).not.toContain('limited')
        expect(ids({...none, derivatives: true})).toEqual(['open', 'nc', 'by', 'limited'])
    })

    it("Allows share-alike licenses when derivatives will use the same license", ({expect}) => {
        expect(ids({...none, derivatives: 'same-license'}))
            .toEqual(['open', 'nc', 'by', 'sa', 'limited'])
    })
})
