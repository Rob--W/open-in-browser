/**
 * (c) 2013 Rob Wu <rob@robwu.nl> (https://robwu.nl)
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals console */
'use strict';
(function() {

/**
 * Generic setter of preference
 * Prefs.init() must be called before use. Prefs.setPrefHandler can be used
 * before Prefs.initialized === true. All others methods should only be invoked
 * once the Prefs.init() promise resolves.
 */
var Prefs = {
    init: init,
    initialized: false,
    setPrefHandler: setPrefHandler,
    get: getPref,
    set: setPref,
    getMimeAction: getMimeAction,
    setMimeAction: setMimeAction,
    removeMimeAction: removeMimeAction,
    exportPrefs: exportPrefs,
    importPrefs: importPrefs
};

// Preferences, filled with default values
var prefs = {
    // User-defined MIME-mappings
    // mime-mappings := { "MIME-type": "<MIME action>", ... } See MimeActions
    'mime-mappings': {},
    // Similar to mime-mappings; used if MIME-sniffing is enabled.
    'sniffed-mime-mappings': {},
    // Whether to disable content sniffing for text/plain responses.
    'text-nosniff': false,
    // Whether to use the file extension for detecting type when mime=application/octet-stream
    'octet-sniff-mime': true,
    // Whether to override the Content-Type response header for the "Download" action.
    'override-download-type': false,
};
var prefHandlers = {};

var _initPromise;
async function init() {
    if (_initPromise) {
        return _initPromise;
    }
    _initPromise = (async () => {
        // Migrate
        let localStorageKeys = Object.keys(localStorage).filter(key => prefs.hasOwnProperty(key));
        if (localStorageKeys.length) {
            let oldPrefs = {};
            for (let key of localStorageKeys) {
                oldPrefs[key] = JSON.parse(localStorage.getItem(key));
            }
            if (oldPrefs.hasOwnProperty('override-download-type') &&
                typeof oldPrefs['override-download-type'] !== 'boolean') {
                // Fix-up bug: In the past I accidentally used a string instead of a boolean.
                delete oldPrefs['override-download-type'];
            }
            await browser.storage.local.set(oldPrefs);
            Object.assign(prefs, oldPrefs);
            localStorage.clear();
            console.log(`Migrated preferences: ${localStorageKeys.join(', ')}`);
        }

        browser.storage.onChanged.addListener(function(changes) {
            for (let [key, {newValue}] of Object.entries(changes)) {
                if (!prefs.hasOwnProperty(key)) continue;
                prefs[key] = newValue;
                let prefHandler = prefHandlers[key];
                if (prefHandler) {
                    prefHandler(prefs[key]);
                }
            }

        });
        Object.assign(prefs, await browser.storage.local.get(prefs));
        Prefs.initialized = true;
    })();
    try {
        await _initPromise;
    } catch (e) {
        _initPromise = null;
        console.error(`Failed to initialized Prefs: ${e}`);
    }
}

/**
 * Assign a new preference handler.
 * @param {string} prefName
 * @param {function} This function will be called immediately, and on subsequent external changes.
 */
async function setPrefHandler(prefName, prefHandler) {
    if (!prefs.hasOwnProperty(prefName)) {
        console.warn('Tried to define preference handler for unknown preference: ' + prefName);
    }
    prefHandlers[prefName] = prefHandler;
    if (!Prefs.initialized) {
        await Prefs.init();
    }
    prefHandler(prefs[prefName]);
}

/**
 * Persist preferences
 * @param {String} prefName Name of preference
 * @private
 */
function save(prefName) {
    console.assert(Prefs.initialized, 'Prefs should be initialized before saving');
    browser.storage.local.set({
        [prefName]: prefs[prefName],
    });
}
// Generic preference setter
function setPref(prefName, value) {
    console.assert(Prefs.initialized, 'Prefs should be initialized before setting');
    prefs[prefName] = value;
    save(prefName);
}
// Generic preference getter
function getPref(prefName) {
    console.assert(Prefs.initialized, 'Prefs should be initialized before getting');
    return prefs[prefName];
}

/**
 * Preferences to manage MIME preferences
 * Each MIME-type is mapped to some behavior, defined as:
 *
 *     <TYPE CHAR><MIME-type>
 * Where
 *    TYPE CHAR  is a single character denoting the preference type
 *    MIME-type  is the MIME-type for the given action, if applicable.
 */
var MimeActions = {
    OIB_MIME         : '0', // Open in browser as <MIME>
    OIB_GENERIC      : '1', // Open in browser as <Text|Web|XML|Image>
    OIB_SERVER_SENT  : '5', // Open in browser as Server-sent MIME
    OIB_SERVER_SNIFF : '6', // Open in browser as sniffed MIME
    OPENWITH         : '+', // Open with <some extension> or <some url>
    DOWNLOAD         : '=', // Skip "Open in browser" and always download the file
};
// Get desired action
function getMimeAction(mimeType, isSniffingMimeType, serverSentMimeType) {
    // mimeType may differ from serverSentMimeType. If isSniffingMimeType
    // is true, then we should prefer mimeType over serverSentMimeType.
    var desiredAction = prefs['mime-mappings'][serverSentMimeType] || '';
    if (isSniffingMimeType) {
        desiredAction = prefs['sniffed-mime-mappings'][mimeType] || desiredAction;
    }
    var actionType = desiredAction.charAt(0); // "" if not set
    var actionArgs = desiredAction.substr(1);
    switch (actionType) {
    case MimeActions.OIB_MIME:
    case MimeActions.OIB_GENERIC:
        return {
            action: actionType,
            mime: actionArgs
        };
    case MimeActions.OIB_SERVER_SENT:
        return {
            action: actionType,
            mime: serverSentMimeType,
        };
    case MimeActions.OIB_SERVER_SNIFF:
        return {
            action: actionType,
            mime: mimeType,
        };
    case MimeActions.OPENWITH:
        return {
            action: actionType,
        };
    case MimeActions.DOWNLOAD:
        return {
            action: actionType
        };
    default:
        if (actionType) {
            console.warn('Unknown action type "' + actionType + '" for "' + mimeType + '".');
        }
        return {};
    }
}
// Set desired action
function setMimeAction(mimeType, isSniffingMimeType, desiredAction) {
    if (typeof desiredAction !== 'object') {
        console.warn('Desired MIME action not specified.');
        return;
    }
    var actionType = desiredAction.action;
    // The following assumes that the desiredAction object is always clean,
    // i.e. it doesn't contain any significant properties of a different action.
    var actionArgs = desiredAction.mime || '';
    if (actionType === MimeActions.OIB_SERVER_SENT ||
        actionType === MimeActions.OIB_SERVER_SNIFF) {
        // For these actions the MIME is inferred from the request.
        actionArgs = '';
    }
    var mimeMapPrefName = isSniffingMimeType ? 'sniffed-mime-mappings' : 'mime-mappings';
    prefs[mimeMapPrefName][mimeType] = actionType + actionArgs;
    save(mimeMapPrefName);
}
// Remove preference for a given MIME-type
function removeMimeAction(mimeType, isSniffingMimeType) {
    var mimeMapPrefName = isSniffingMimeType ? 'sniffed-mime-mappings' : 'mime-mappings';
    if (prefs[mimeMapPrefName].hasOwnProperty(mimeType)) {
        delete prefs[mimeMapPrefName][mimeType];
        save(mimeMapPrefName);
    }
}

function exportPrefs() {
    return JSON.stringify(prefs, null, 2);
}
function importPrefs(newPrefsString) {
    var newPrefs = JSON.parse(newPrefsString);
    if (typeof newPrefs !== 'object'|| newPrefs === null) {
        throw new Error('Invalid format; expected an object in JSON');
    }
    Object.keys(prefs).forEach(function(key) {
        if (newPrefs.hasOwnProperty(key)) {
            setPref(key, newPrefs[key]);
        }
    });
}

// Exported
window.Prefs = Prefs;
window.MimeActions = MimeActions;
})();
