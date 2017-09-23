#!/usr/bin/env node
/**
 * (c) 2013 Rob Wu <rob@robwu.nl> (https://robwu.nl)
 *
 * Parses all .json files in viewers/ and outputs to extensions/external-viewers.json
 * This information is used by the "Open With" feature of the extension.
 *
 * See parseSourceDefinitionObject for the format definition
 * Unrecognized keys are reported, unless it's prefixed with _.
 *
 * See also viewers/.template.json
 */

/* eslint-env node */
'use strict';

var fs = require('fs');
var path = require('path');

var extensionRoot = path.resolve(__dirname, 'extension');
var inputDirectory = path.resolve(__dirname, 'viewers');
var outputFileName = path.join(extensionRoot, 'external-viewers.js');

var inputFiles = fs.readdirSync(inputDirectory).filter(function(filename) {
    if (filename.charAt(0) === '.') return;
    if (filename.match(/\.json$/)) return true;
    console.warn('Not a JSON file: ' + filename);
}).sort(); // Sorting names just to make the output file consistent across git commits

process.nextTick(function() {
    var outputObject = {};
    var successCount = 0;
    inputFiles.forEach(function(fileName) {
        if (importSourceDefinition(outputObject, fileName)) {
            successCount++;
        }
    });
    if (successCount !== inputFiles.length) {
        var errorCount = inputFiles.length - successCount;
        console.warn(errorCount + ' input files were ignored because of errors.');
    } else {
        console.log('All input files were successfully processed.');
    }
    var outputJson = JSON.stringify(outputObject, null, '\t');
    var r_mime_types = /^(\s*)"mime_types":(\s*)\[\s*"([\S\s]+?)"\s*\]/mg;
    var EXTERNAL_VIEWERS = outputJson.replace(r_mime_types, mimeToRegExp);
    var outputData = `'use strict';
/* exported EXTERNAL_VIEWERS */

var EXTERNAL_VIEWERS = ${EXTERNAL_VIEWERS};
`;

    fs.writeFileSync(outputFileName, outputData);
    console.log('Written to ' + outputFileName);
});

// Used by outputJson.replace to expand the mime_types array to a regex.
function mimeToRegExp(full_match, leadingWhitespace, separatorWhitespace, mimeTypes) {
    mimeTypes = mimeTypes.replace(/[[^$.|?+(){}\\/]/g, '\\$&'); // Escape special characters
    mimeTypes = mimeTypes.replace(/\*/g, '.+');
    mimeTypes = mimeTypes.replace(/",\s*"/g, ')|(?:');
    mimeTypes = '(?:' + mimeTypes + ')';
    mimeTypes = '"r_mime_types":' + separatorWhitespace + '/^' + mimeTypes + '$/i';
    return full_match + ',\n' + leadingWhitespace + mimeTypes;
}



function importSourceDefinition(/*object*/output, /*string*/fileName) {
    console.log('Processing source: ' + fileName);

    var identifier = fileName.slice(0, -5); // Remove trailing .json
    //
    // File name constraint because of chrome.i18n
    if (/\W/.test(identifier)) {
        console.error('Invalid character in file name. Allowed characters: A-Z a-z 0-9 _');
        return;
    }
    var filePath = path.join(inputDirectory, fileName);

    var json = fs.readFileSync(filePath, {encoding: 'utf-8'});
    // Remove //-comments. May only contain leading space;
    // "k":"v", // comment is NOT OK (contains something before //)
    //          // comment is OK (only leading whitespace)
    json = json.replace(/^\s+\/\/.*/m);

    // Note: Might generate an error because of failure
    // This error is not caught, because incorrect JSON needs to be fixed urgently.
    var orig = JSON.parse(json);

    var parsed;
    try {
        parsed = parseSourceDefinitionObject(orig);
    } catch (e) {
        console.error(e);
    }
    if (parsed) {
        output[identifier] = parsed;
        console.log('Successfully added ' + identifier);
        return true;
    } else {
        console.log('Did not add ' + identifier + ' because of previous errors.');
    }
}

function parseSourceDefinitionObject(/*object*/orig) {
    var assertionFailed = false;
    function assert(assertion, errorMessage) {
        if (!assertion) {
            console.error('E: ' + errorMessage);
            assertionFailed = true;
        }
    }
    var parsed = {};

    // type
    var types = ['web', 'extension'];
    assert(types.indexOf(orig.type) !== -1,
           '"type" must be one of ' + types + '. Found "' + orig.type + '"');
    parsed.type = orig.type;

    // name
    assert(typeof orig.name === 'string', '"name" is a required string.');
    parsed.name = orig.name;

    // url
    assert(typeof orig.url === 'string', '"url" is a required string.');
    var validVariables = ['url', 'rawurl'];
    if (parsed.type === 'extension') {
        validVariables.push('extensionid');
    }
    var variables = orig.url.match(/\$\{([^}]*)\}/g) || [];
    variables.forEach(function(variable) {
        assert(validVariables.indexOf(variable) === -1,
               'url variable must be one of ' + validVariables + '. Found "' + variable + '"');
    });
    parsed.url = orig.url;

    // extensionids
    if (parsed.type === 'extension') {
        assert(Array.isArray(orig.extensionids), '"extensionids" is a required array.');
        assert(orig.extensionids.length > 0, '"extensionids" requires at least one element.');
        orig.extensionids.forEach(function(extensionid) {
            assert(/^[a-p]{32}$/.test(extensionid),
                   'Invalid Chromium extension ID, got "' + extensionid + '".');
        });
        parsed.extensionids = orig.extensionids;
    } else {
        assert(!('extensionids' in orig), '"extensionids" is only valid for type="extension"');
    }

    // mime_types
    assert(Array.isArray(orig.mime_types), '"mime_types" is a required array.');
    assert(orig.mime_types.length > 0, '"mime_types" requires at least one element.');
    orig.mime_types.forEach(function(mimeType) {
        // RFC 2045, section 5.1  (definition of token)
        // RFC 3023, section A.12 (practical list of allowed characters)
        var r_mime_token = "[A-Za-z0-9.*\\-_%'`#&~!$^+{}|]+";
        var r_mime = new RegExp('^' + r_mime_token + '/' + r_mime_token + '$', 'i');
        assert(r_mime.test(mimeType), 'Invalid MIME-type. Expected a valid MIME-type ' +
                                      '(or wildcards such as */*), got "' + mimeType + '"');
    });
    parsed.mime_types = orig.mime_types;

    Object.keys(orig).forEach(function(key) {
        if (key.charAt(0) !== '_' && !parsed.hasOwnProperty(key)) {
            console.warn('Unrecognized key: "' + key + '"');
        }
    });
    return assertionFailed ? null : parsed;
}
