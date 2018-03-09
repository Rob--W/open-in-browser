#!/usr/bin/env node
/**
 * (c) 2013 Rob Wu <rob@robwu.nl> (https://robwu.nl)
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Update the translations of _locales/<locale>/messages.json using Mozilla Firefox's
 * translated strings
 *
 * This script runs the following steps for each <locale>:
 * - Read from messages.json
 * - Fetch translations from external sources (courtesy of Mozilla)
 * - Merge keys
 * - Write to messages.json
 */

/* eslint-env node */
'use strict';

var fs = require('fs');
var path = require('path');
var request = require('request');

//
// Begin config
//

var extensionRoot = path.resolve(__dirname, 'extension');

// Used to exclude localized strings that are not supported by the CWS.
// Based on https://developers.google.com/chrome/web-store/docs/i18n?csw=1#localeTable
var i18n_supported_langs = [
    'ar', 'am', 'bg', 'bn', 'ca', 'cs', 'da', 'de', 'el', 'en', 'en_GB', 'en_US', 'es', 'es_419',
    'et', 'fa', 'fi', 'fil', 'fr', 'gu', 'he', 'hi', 'hr', 'hu', 'id', 'it', 'ja', 'kn', 'ko',
    'lt', 'lv', 'ml', 'mr', 'ms', 'nl', 'no', 'pl', 'pt_BR', 'pt_PT', 'ro', 'ru', 'sk', 'sl', 'sr',
    'sv', 'sw', 'ta', 'te', 'th', 'tr', 'uk', 'vi', 'zh_CN', 'zh_TW'
];
// Empty key = omit language
// If language code of Chrome and Firefox differ, use the following map (chrome-firefox) to
// set a different mapping.
var LANGUAGE_MAPPING = {
    "am": "", // Amharic, Not supported by Firefox
    "bn": "bn-IN", // There's also a bn-BD, but its last update was feb 2011...
//    "en": "", // SPECIAL CASE: different URL, handled below in getLanguageFileData
    "en_US": "", // === en, don't duplicate
    "es": "es-ES",
    // "es-419" represents "Spanish as used in Latin America and the Caribbean"
    //      according to http://www.w3.org/International/articles/bcp47/
    // Available locales in Firefox: "es-AR", "es-CL", "es-ES", "es-MX"
    //    AR = Argentina, CL = Chile, ES = Spain, MX = Mexico
    //    MX = outdated and incomplete translations
    // Leaving the only viable choices to be AR, CL and ES.
    // I didn't see a big difference between these, so I decided to leave out
    // "es_419" (because it's already covered by "es")
    "es_419": "",
    "fil": "", // Filipino, Not supported by Firefox
    "gu": "gu-IN",
    "hi": "hi-IN",
    "no": "nn-NO",
    "sv": "sv-SE",
};

/* Via F12 console on http://hg.mozilla.org/releases/l10n/mozilla-release/
chrome = ... i18n_supported_langs ...

firefox = [].map.call($$('a.list'), function(a) {
    return a.textContent.replace('-','_');
});

equal = firefox.filter(function(lang) { return chrome.indexOf(lang) !== -1; });
missing = chrome.filter(function(lang) { return equal.indexOf(lang) === -1; });

// For finding potential candidates to fill the missing gaps
firefoxonly = firefox.filter(function(lang) { return chrome.indexOf(lang) === -1; })
*/


/**
 * Source definition:
 * - source {string} Path to source (on Mozilla)
 * - properties {array of strings} Properties to put on messages.json
 * - aliases {object} Aliases for the property, resolved recursively.
 *                    For example, if properties is ["niceName"]
 *                    and aliases {"foo":"bar","niceName":"foo"},
 *                    and the .properties file contains bar = red,
 *                    then "niceName": {"messages": "red"} will be written to messages.json.
 */
var SOURCES = [{
    source: '/chrome/mozapps/downloads/unknownContentType.dtd',
    properties: [
        'intro2',
        'from',
        'actionQuestion',
        'openWith',
        'other',
        'saveFile',
        'rememberChoice',
        'whichIs'
    ],
    aliases: {
        'intro': 'intro2',
        'save': 'saveFile',
        'whichIsA': 'whichIs'
    }
}, {
    source: '/chrome/global/dialog.properties',
    properties: [
        'button-accept',
        'button-cancel'
    ]
}, {
    source: '/chrome/mozapps/downloads/downloads.properties',
    properties: [
        'bytes',
        'kilobyte',
        'megabyte',
        'gigabyte',
    ],
}, {
    source: '/chrome/mozapps/downloads/unknownContentType.properties',
    properties: [
        'orderedFileSizeWithType',
        'opening_title'
    ],
    aliases: {
        'title': 'opening_title'
    }
}, {
    source: '/chrome/global/preferences.dtd',
    properties: [
        'preferences'
    ],
    aliases: {
        'preferencesDefaultTitleMac.title': 'preferences'
    }
}, {
    source: '/chrome/mozapps/handling/handling.dtd',
    properties: [
        'chooseOtherApp'
    ],
    aliases: {
        'ChooseOtherApp.description': 'chooseOtherApp',
    },
}];

var EXPECTED_DOLLARS = {
    orderedFileSizeWithType: 3,
};

/**
 * @param json {object} Object to be fed to messages.json
 */
function POST_TRANSLATE_HOOK(json) {
    // extension/i18n.js will replace "brandShortName" with the browser name.
    replace('actionQuestion', '&brandShortName;', 'brandShortName');
    replace('opening_title', '%S', '$1');
    replace('orderedFileSizeWithType', /%([1-3])\$S/g, '$$$1');

    function replace(key, searchTerm, replacer) {
        key = key.replace(/-/g, '_');
        if (json[key]) {
            json[key].message = json[key].message.replace(searchTerm, replacer);
        }
    }
}
//
// End of config
//


process.nextTick(function() {
    i18n_supported_langs.forEach(updateMessagesJSON);
});


function updateMessagesJSON(lang) {
    getLanguageFileData(lang, function(responseTexts) {
        console.log('Processing ' + lang + '...');
        var dirname = path.join(extensionRoot, '_locales', lang);
        var filename = path.join(dirname, 'messages.json');

        var json;
        if (fs.existsSync(filename)) {
            json = fs.readFileSync(filename, {encoding: 'utf-8'});
            json = JSON.parse(json);
        } else {
            json = {};
        }

        SOURCES.forEach(function(sourceDefinition, index) {
            var responseText = responseTexts[index];
            var pattern;
            if (sourceDefinition.source.lastIndexOf('.dtd') > 0) {
                responseText = responseText.replace(/<!--[\S\s]*?-->/g, '');
                pattern = /<!ENTITY\s+([^\s]+)[^"]*"([^"]+)"/ig;
                //         <!ENTITY identifier       "  ...  ">
            } else {
                pattern = /^([^=\s]*)\s*=\s*(.+)$/mg;
                //          identifier  =  ...
            }
            transferTranslationToTarget(responseText, json, pattern, sourceDefinition);
        });

        POST_TRANSLATE_HOOK(json);
        
        // Serialize JSON, pretty-print for better git diff
        var messages = JSON.stringify(json, null, '\t');
        if (!fs.existsSync(dirname)) {
            fs.mkdirSync(dirname);
        }
        fs.writeFileSync(filename, messages);
    });
}

/**
 * @param responseText {string}
 * @param target {object} Translations will be assigned to this object
 * @param pattern {regex} Do not re-use this regex, because its state will change (lastIndex).
 * @param sourceDefinition.properties {array} Properties to copy
 * @param sourceDefinition.aliases {optional object} Alternative name for a property.
 */
function transferTranslationToTarget(responseText, target, pattern, sourceDefinition) {
    var properties = sourceDefinition.properties;
    var seenProperties = [];
    var aliases = sourceDefinition.aliases;
    var match;
    while (properties.length > 0 && (match = pattern.exec(responseText)) !== null) {
        var identifier = match[1];
        var value = match[2].trim();

        // intro2.label = intro2.
        // This step is used to avoid needless repetition of alias definitions.
        identifier = identifier.replace(/\.label$/, '');

        if (aliases) {
            var seen = []; // Guards against stupidity
            while (aliases[identifier]) {
                identifier = aliases[identifier];
                if (seen.indexOf(identifier) !== -1) {
                    console.error('Fatal error: Detected loop in aliases!');
                    return;
                }
                seen.push(identifier);
            }
        }
        var propertyIndex = properties.indexOf(identifier);
        if (propertyIndex === -1) {
            // Nah, not wanted
            continue;
        }
        if (seenProperties.indexOf(identifier) !== -1) {
            console.warn('Duplicate key: ' + identifier);
        }
        seenProperties.push(identifier);

        // Format of chrome.i18n.
        // identifier: Only ASCII [a-z], [A-Z], [0-9] and "_" are allowed.
        identifier = identifier.replace(/-/g, '_');
        if (/\W/.test(identifier)) {
            console.warn('Illegal symbol in identifier: ' + identifier);
        }
        var expectedDollars = EXPECTED_DOLLARS[identifier] || 0;
        var actualDollars = value.split('$').length - 1;
        if (expectedDollars === actualDollars) {
            // Cool. Nothing to do.
        } else if (expectedDollars) {
            console.warn('Expected ' + expectedDollars + ' "$" in translation: ' + identifier +
                '=' + value + ' (but found ' + actualDollars + ')');
        } else {
            console.warn('Found "$" in translation: ' + identifier + '=' + value);
        }
        target[identifier] = {
            message: value
        };
    }

    if (properties.length !== seenProperties.length) {
        properties.forEach(function(property) {
            if (seenProperties.indexOf(property) === -1) {
                console.warn('Not translated: ' + property);
            }
        });
    }
}

/**
 * @param lang {string} item from i18n_supported_langs array
 * @param callback {function(results)}
 *   results = array of responseTexts, in the same order of the SOURCES array
 */
function getLanguageFileData(lang, callback) {
    var mozLang = LANGUAGE_MAPPING[lang];
    if (mozLang === "") {
        // console.log('Ignored lang: ' + lang);
        return;
    }
    mozLang = (mozLang || lang).replace('_', '-');
    var baseUrl;
    if (mozLang === 'en' || mozLang === 'en-US') {
        baseUrl = 'http://hg.mozilla.org/mozilla-central/raw-file/tip/toolkit/locales/en-US';
    } else {
        baseUrl = 'http://hg.mozilla.org/releases/l10n/mozilla-release/' + mozLang +
                  '/raw-file/tip/toolkit';
    }
    var remainingFiles = SOURCES.length;
    var results = [];

    // Global sources array
    SOURCES.forEach(function(sourceDefinition, index) {
        var source = sourceDefinition.source;
        httpGet(baseUrl + source, function(responseText) {
            results[index] = responseText;
            if (--remainingFiles === 0) {
                callback(results);
            }
        });
    });
}

/**
 * Get a resource.
 * Note: When an eror occurs, the callback is not called, and an error is logged to the console.
 *
 * @param url {string} Location of resource to be fetched
 * @param callback {function(responseText)}
 */
function httpGet(url, callback) {
    request(url, function(error, response, body) {
        if (error) {
            console.error('Failed to get ' + url + ',\n' + error);
        } else if (response.statusCode !== 200) {
            console.error('HTTP status ' + response.statusCode + ' fir ' + url);
        } else {
            callback(body);
        }
    });
}
