const N3 = require("n3");
const fs = require("fs");
const express = require('express');
const { defaultGraph } = N3.DataFactory;
const namespace = require('@rdfjs/namespace');
const rdf = namespace("http://www.w3.org/1999/02/22-rdf-syntax-ns#", N3.DataFactory);
const Traversal = require('./RDFGraphTraversal.js');
const pug = require('pug');
const prettify = require('pretty');

const [baseIRI, port] = (() => {
    if (typeof(PhusionPassenger) !== 'undefined') {
        return ["http://semsite.bruy.at/", 'passenger'];
    } else {
        return ["http://localhost:3000/", '3000'];
    }
})();

const Database = {
    produceTheTraversal: function()  {
        const store = new N3.Store();
        const fileContent = fs.readFileSync("database.ttl", "utf-8");
        const parser = new N3.Parser({ baseIRI })
        store.addQuads(parser.parse(fileContent));
        
        console.log("The store has " + store.size + " quads.");
    
        const prefixes = {
            '': baseIRI,
            'rdf': "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
        };
    
        return new Traversal(store, prefixes);
    },

    /**
     * @param {Traversal} traversal 
     */
    getManagedIris: function(traversal) {
        return traversal.elements
            .map(e => e.relativeIRI)
            .filter(e => e !== undefined);
    },

    findEveryQuadsWith: function(store, iri) {
        return store.getQuads().filter(
            quad => quad.subject.equals(iri)
                    || quad.predicate.equals(iri)
                    || quad.object.equals(iri)
                    || quad.graph.equals(iri)
        );
    }
};

const Render = {
    /* ==== TERM SERIALIZATION ==== */

    adaptTerm: function(term) {
        if (term.termType !== 'NamedNode') {
            return { value: term.value };
        } else {
            return { iri: term.value };
        }
    },

    adaptQuads: function(quads) {
        return quads.map(quad => {
            return {
                'subject'  : Render.adaptTerm(quad.subject),
                'predicate': Render.adaptTerm(quad.predicate),
                'object'   : Render.adaptTerm(quad.object)
            };
        });
    },

    /* ==== TEMPLATE ==== */
    loadTemplates: function(directory) {
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
    },

    finishPage: function(templates, content) {
        return prettify(templates.general({ content }));
    }
};


const traversal = Database.produceTheTraversal();
const managedIris = Database.getManagedIris(traversal);

const app = express();

app.listen(port, () => {
    console.log(`=== Server started: ${baseIRI}`);
});

const templates = Render.loadTemplates("templates/");

function setUpRoutes() {
    {
        const mainContent = templates.triples({
            sectionName: "Known triples",
            quads: Render.adaptQuads(traversal.store.getQuads())
        }) + templates.index({ content: traversal.toDot() });

        const content = Render.finishPage(templates, mainContent);
        app.get("/", (_req, res) => res.send(content));
    }

    function findTemplate(types) {
        const useTemplate = N3.DataFactory.namedNode(baseIRI + "useTemplate");
        for (const type of types) {
            let template = traversal.store.getQuads(type.object, useTemplate);
            if (template.length !== 0)
                return template[0].object.value;
        }
        
        return undefined;
    }

    managedIris.forEach(managedIri => {
        const theIRI = N3.DataFactory.namedNode(baseIRI + managedIri);
        const types = traversal.store.getQuads(theIRI, rdf.type, null, defaultGraph());
        const template = findTemplate(types);
        const quads = Database.findEveryQuadsWith(traversal.store, theIRI);

        let content = "";

        if (template !== undefined) {
            const resource = traversal[":" + managedIri];

            content += templates[template]({
                "resource": resource
            });
        }

        content += templates.triples({ 
            "sectionName": "Related triples",
            "quads": Render.adaptQuads(quads)
        });

        const render = Render.finishPage(templates, content);
        app.get("/" + managedIri, (_req, res) => res.send(render));
    });

}

setUpRoutes();
