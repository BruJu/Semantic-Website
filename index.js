const N3 = require("n3");
const fs = require("fs");
const express = require('express');
const { defaultGraph } = N3.DataFactory;
const namespace = require('@rdfjs/namespace');
const rdf = namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#", N3.DataFactory);
const RdfClass = require('./RDFGraphTraversal.js');
const pug = require('pug');
const prettify = require('pretty');

const [baseIRI, port] = (() => {
    if (typeof(PhusionPassenger) !== 'undefined') {
        return ["http://semsite.bruy.at/", 'passenger'];
    } else {
        return ["http://localhost:3000/", '3000'];
    }
})();

function getSuffix(iri) {
    return iri.substr(baseIRI.length);
}

function produceTheStore()  {
    const store = new N3.Store();
    const fileContent = fs.readFileSync("database.ttl", "utf-8");
    const parser = new N3.Parser({ baseIRI })
    store.addQuads(parser.parse(fileContent));
    
    console.log("The store has " + store.size + " quads.");
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
const prefixes = {
    'rdf': "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
};

const objects = RdfClass(baseIRI, prefixes, store);


const managedIris = getManagedIris(store);



const app = express();

app.listen(port, () => {
    console.log(`=== Server started: ${baseIRI}`);
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



function loadTemplates(directory) {
    const paths = fs.readdirSync(directory);

    let templates = {};

    for (const path of paths) {
        if (!path.endsWith(".pug")) continue;

        const fullPath = directory + path;
        const templateName = path.substr(0, path.length - ".pug".length);
        templates[templateName] = pug.compileFile(fullPath);
    }

    if (templates.general === undefined || templates.triples === undefined) {
        throw Error("Didn't found either general or triples");
    }

    return templates;
}

function makeBasicRenderForQuads(quads) {
    const quadsTable = templates.triples({
        "sectionName": "Related triples",
        "quads": adaptQuads(quads)
    });
    const content = templates.general(
        {
            content: quadsTable
        }
    );
    return content;
}

const templates = loadTemplates("templates/");


function setUpRoutes() {
    {
        const content = prettify(makeBasicRenderForQuads(store.getQuads()));
        app.get("/", function(req, res) {
            res.send(content);
        })
    }

    function findTemplate(types) {
        for (const type of types) {
            let template = store.getQuads(type.object, N3.DataFactory.namedNode(baseIRI + "useTemplate"));
            if (template.length !== 0)
                return template[0].object.value;
        }
        
        return undefined;
    }


    managedIris.forEach(managedIri => {
        const theIRI = N3.DataFactory.namedNode(baseIRI + managedIri);
        const types = store.getQuads(theIRI, rdf.type, null, defaultGraph());
        const template = findTemplate(types);
        const quads = findEveryQuadsWith(store, theIRI);

        let render;
        if (template !== undefined) {
            let quadsTable = templates[template](
                {
                    "quads": adaptQuads(quads),
                    "resources": objects[":" + managedIri]
                }
            );

            quadsTable += templates.triples({ 
                sectionName: "Related triples",
                "quads": adaptQuads(quads) });
            render = templates.general(
                {
                    content: quadsTable
                }
            );

        } else {
            render = makeBasicRenderForQuads(quads);
        }

        render = prettify(render);


        app.get("/" + managedIri, function(req, res) {
            res.send(render);
        });
    });

}

setUpRoutes();
