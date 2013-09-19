/**
 * (c) 2013 Rob Wu <gwnRob@gmail.com>
 */
/* globals console */
'use strict';
(function() {

/**
 * Generic setter of preference
 */
var Prefs = {
    init: init,
    setPrefHandler: setPrefHandler,
    get: getPref,
    set: setPref,
    getMimeAction: getMimeAction,
    setMimeAction: setMimeAction,
    removeMimeAction: removeMimeAction,
};

// Preferences, filled with default values
var prefs = {
    // User-defined MIME-mappings
    // mime-mappings := { "MIME-type": "<MIME action>", ... } See MimeActions
    'mime-mappings': {},
    // Whether to add the "X-Content-Type-Options: nosniff" header to text/plain requests
    'text-nosniff': true,
    // Whether to use the file extension for detecting type when mime=application/octet-stream
    'octet-sniff-mime': true,
};
var prefHandlers = {};
function init() {
    Object.keys(prefs).forEach(function(key) {
        if (localStorage.hasOwnProperty(key)) prefs[key] = JSON.parse(localStorage.getItem(key));
    });

    if (init.hasRun) return;
    init.hasRun = true;
    // Add storage event listener only once
    window.addEventListener('storage', function(event) {
        if (prefs.hasOwnProperty(event.key)) {
            prefs[event.key] = JSON.parse(event.newValue);
            var prefHandler = prefHandlers[event.key];
            if (prefHandler) {
                prefHandler(prefs[event.key]);
            }
        }
    });
}

/**
 * Assign a new preference handler.
 * @param {string} prefName
 * @param {function} This function will be called immediately, and on subsequent external changes.
 */
function setPrefHandler(prefName, prefHandler) {
    if (!prefs.hasOwnProperty(prefName)) {
        console.warn('Tried to define preference handler for unknown preference: ' + prefName);
    }
    prefHandlers[prefName] = prefHandler;
    prefHandler(prefs[prefName]);
}

/**
 * Persist preferences
 * @param {String} prefName Name of preference
 * @private
 */
function save(prefName) {
    var value = JSON.stringify(prefs[prefName]);
    localStorage.setItem(prefName, value);
}
// Generic preference setter
function setPref(prefName, value) {
    prefs[prefName] = value;
    save(prefName);
}
// Generic preference getter
function getPref(prefName) {
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
    OIB_SERVER_SENT  : '5', // Open in browser as Server-sent MIME //TODO:header vs file ext
    // TODO: "Open with <some extension> or <some url> ?
    DOWNLOAD         : '=', // Skip "Open in browser" and always download the file
};
// Get desired action
function getMimeAction(mimeType) {
    var desiredAction = prefs['mime-mappings'][mimeType] || '';
    var actionType = desiredAction.charAt(0); // "" if not set
    var actionArgs = desiredAction.substr(1);
    switch (actionType) {
    case MimeActions.DOWNLOAD:
        return {
            action: actionType
        };
    default: // OIB_*
        return {
            action: actionType,
            mime: actionArgs
        };
    }
}
// Set desired action
function setMimeAction(mimeType, desiredAction) {
    if (typeof desiredAction !== 'object') {
        console.warn('Desired MIME action not specified.');
        return;
    }
    var actionType = desiredAction.action;
    var actionArgs = desiredAction.mime || '';
    prefs['mime-mappings'][mimeType] = actionType + actionArgs;
    save('mime-mappings');
}
// Remove preference for a given MIME-type
function removeMimeAction(mimeType) {
    if (prefs['mime-mappings'].hasOwnProperty(mimeType)) {
        delete prefs['mime-mappings'][mimeType];
        save('mime-mappings');
    }
}

// Exported
window.Prefs = Prefs;
window.MimeActions = MimeActions;
})();
