// This is inspired by rdf-object
// https://www.npmjs.com/package/rdf-object


/**
 * 
 * @param {String} iri 
 * @param {*} base 
 * @param {*} prefixes 
 * @returns 
 */
function readIRI(iri, base, prefixes) {
    let coma = iri.indexOf(":");
    let dash = iri.indexOf("/");
    if (dash !== -1 && coma > dash) {
        coma = -1;
    }
    if (iri.startsWith("http:") || iri.startsWith("https:")) {
        coma = -1;
    }

    if (coma === -1) {
        if (iri.startsWith(base)) {
            let short = iri.substr(base.length);
            return [short, iri];
        }

        for (const [prefix, prefixIrl] of Object.entries(prefixes)) {
            if (iri.startsWith(prefixIrl)) {
                const short = prefix + ":" + iri.substring(prefixIrl.length);
                return [short, iri];
            }
        }

        return null;
    } else {
        let prefix = iri.substr(0, coma);
        let suffix = iri.substr(coma + 1);

        let prefixIRI = prefix === "" ? base : prefixes[prefix];
        if (prefixIRI === undefined) return null;

        return [iri, prefixIRI + suffix];
    }
}

class RdfObject {
    constructor(iris) {
        this.shortIRI = iris[0];
        this.longIRI = iris[1];
        this.isRDFObject = true;
    }

    at(a) {
        return this[a];
    }
}

class RdfObjects {
    constructor(baseIRI, prefixes) {
        this.baseIRI = baseIRI;
        this.prefixes = prefixes;
    }

    /**
     * 
     * @param {String} iri 
     */
    getFromIRI(iri) {
        let z = readIRI(iri, this.baseIRI, this.prefixes);
        if (z === null) {
            return undefined;
        }

        if (this[z[0]] === undefined) {
            this[z[0]] = new RdfObject(z);
        }

        return this[z[0]];
    }

    getFromTerm(term) {
        if (term.termType === 'NamedNode') {
            let x = this.getFromIRI(term.value, this.baseIRI, this.prefixes);
            if (x === undefined) {
                return term;
            } else {
                return x;
            }
        } else if (term.termType === 'Literal') {
            return term.value;
        } else {
            throw Error(term.termType + " are not yet supported");
        }
    }
}

function ToObjects(baseIRI, prefixes, store) {
    let result = new RdfObjects(baseIRI, prefixes);

    for (const quad of store.getQuads()) {
        let subject   = result.getFromTerm(quad.subject);
        let predicate = result.getFromTerm(quad.predicate);
        let object    = result.getFromTerm(quad.object);

        if (subject.isRDFObject === true) {
            let field;
            if (predicate.isRDFObject) {
                field = predicate.shortIRI;
            } else {
                field = predicate.value;
            }

            if (subject[field] === undefined) {
                subject[field] = object;
            } else if (Array.isArray(subject[field])) {
                subject[field].push(object)
            } else {
                subject[field] = [subject[field], object];
            }
        }
    }

    return result;
}


module.exports = ToObjects;