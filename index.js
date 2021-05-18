const N3 = require("n3");
const fs = require("fs");
const mustache = require("mustache");
const express = require('express');

const baseIRI = "http://semsite.bruy.at/"
const port = 'passenger';

function getSuffix(iri) {
    return iri.substr(baseIRI.length);
}

function produceTheStore()  {
    const store = new N3.Store();
    const fileContent = fs.readFileSync("database.ttl", "utf-8");
    const parser = new N3.Parser({ baseIRI })
    store.addQuads(parser.parse(fileContent));
    
    console.error("The store has " + store.size + "quads.");
    return store;
}

function getManagedIris(store) {
    let managedIris = new Set();

    store.getQuads().forEach(quad => {
        for (const role of ['subject', 'predicate', 'object', 'graph']) {
            let term = quad[role];
            if (term.termType === 'NamedNode' && term.value.startsWith(baseIRI)) {
                managedIris.add(getSuffix(term.value));
            }
        }
    });

    return managedIris;
}

function findEveryQuadsWith(store, iri) {
    return store.getQuads().filter(
        quad => {
            return quad.subject.equals(iri)
                || quad.predicate.equals(iri)
                || quad.object.equals(iri)
                || quad.graph.equals(iri);
        }
    );
}

const store = produceTheStore();
const managedIris = getManagedIris(store);



const app = express();

app.listen(port, () => {
    console.log(`=== Server started: ${baseIRI}`)
});


function adaptTerm(term) {
    if (term.termType !== 'NamedNode') {
        return { 
            left: "",
            right: "",
            value: term.value
        };
    } else {
        return {
            left: '<a href="'+term.value+'">',
            right: '</a>',
            value: term.value
        }
    }
}

function adaptQuads(quads) {
    return quads.map(quad =>
        [
            adaptTerm(quad.subject),
            adaptTerm(quad.predicate),
            adaptTerm(quad.object)
        ]
    );
}


let template = fs.readFileSync("template_triples.html", "utf-8");


{
    let quads = store.getQuads();
    const content = mustache.render(template, { "quads": adaptQuads(quads) });
    app.get("/", function(req, res) {
        res.send(content);
    })
}


managedIris.forEach(managedIri => {
    const quads = findEveryQuadsWith(store, N3.DataFactory.namedNode(baseIRI + managedIri));
    const content = mustache.render(template, { "quads": adaptQuads(quads) });
    app.get("/" + managedIri, function(req, res) {
        res.send(content);
    });
});
