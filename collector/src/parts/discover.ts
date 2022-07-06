
import * as door43 from '../integrations/door43.js'
import * as ebible from '../integrations/ebible.js'
import * as dbl from '../integrations/dbl.js'


export async function discover_translations(service:string){
    // Discover translations and save their meta data

    // Warn if service arg invalid
    const services = ['door43', 'ebible', 'dbl']
    if (service && !services.includes(service)){
        console.error(`Service must be one of: ` + services.join(', '))
        return
    }

    // Consult one or more services
    // NOTE Order is from most->least likely to have original sources
    if (!service || service === 'door43'){
        await door43.discover()
    }
    if (!service || service === 'ebible'){
        await ebible.discover()
    }
    if (!service || service === 'dbl'){
        await dbl.discover()
    }
}
