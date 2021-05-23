// This is inspired by rdf-object
// https://www.npmjs.com/package/rdf-object


/**
 * Return the short IRI if it exists
 * @param {String} iri 
 * @param {*} prefixes The list of prefixes
 * @returns A list of valid short IRIs
 */
function findShortIRIs(iri, prefixes) {
    return Object.entries(prefixes)
        .filter(prefix => iri.startsWith(prefix[1]))
        .map(prefix => prefix[0] + ":" + iri.substring(prefix[1].length));
}

/** Wrapper for an RDF/JS term to register its path */
class RDFElement {
    /**
     * Builds an RDFElement with no path
     * @param {*} term The RDF/JS term
     * @param {string[]} shortIRIs Known short IRIs for the node
     */
    constructor(term, shortIRIs) {
        this.term = term;
        this.termType = term.termType;
        this.longIRI = term.termType === 'NamedNode' ? term.value : undefined;
        this.shortIRIs = shortIRIs;
        this.relativeIRI = undefined;
        
        this.iris = [...shortIRIs];
        if (this.longIRI !== undefined) this.iris.push(this.longIRI);

        if (term.termType === 'Literal') {
            this.toString = () => this.term.value;
        }

        if (term.termType === 'NamedNode') {
            let t = this.iris.find(iri => iri.startsWith(":"));
            if (t !== undefined) {
                this.relativeIRI = t.substring(1);
            }
        }
    }
}

class RDFTraversal {
    constructor(store, prefixes) {
        this.prefixes = prefixes;
        this.elements = [];
        this.store = store;

        for (const quad of store.getQuads()) {
            this._addTriple(quad.subject, quad.predicate, quad.object);
        }
    }

    _addTriple(subject, predicate, object) {
        const s = this._getFromTerm(subject);
        const p = this._getFromTerm(predicate);
        const o = this._getFromTerm(object);

        if (p.iris.length === 0) {
            throw Error("A node doesn't have a named node as a predicate");
        }

        for (const path of p.iris) {
            s[path] = o;
        }
    }
    
    _getFromTerm(term) {
        if (term.termType === 'NamedNode') {
            const shortIRIs = findShortIRIs(term.value, this.prefixes);

            let rdfElement = this[term.value];
            if (rdfElement === undefined) {
                let e = new RDFElement(term, shortIRIs);

                for (const iri of e.iris) {
                    this[iri] = e;
                }

                this.elements.push(e);
            }
            return this[term.value];
        } else {
            return new RDFElement(term, []);
        }
    }
}

module.exports = RDFTraversal;
