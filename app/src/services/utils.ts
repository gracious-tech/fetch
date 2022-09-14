

export function wait(ms:number):Promise<void>{
    // Wait given ms before resolving promise
    return new Promise(resolve => {setTimeout(resolve, ms)})
}
