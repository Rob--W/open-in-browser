/**
 * (c) 2013 Rob Wu <rob@robwu.nl> (https://robwu.nl)
 */
'use strict';
/* globals EXTERNAL_VIEWERS, Prefs, console */
(function() {
window.OpenWith = {
    getAvailableViewers: getAvailableViewers,
    openWith: openWith
};

// Which viewers are enabled, i.e. should show up in the dropdown box?
var externalViewers = [];

Prefs.setPrefHandler('external-viewers', updateExternalViewersInfo);
function updateExternalViewersInfo() {
    var externalViewersPref = Prefs.get('external-viewers');
    externalViewers = [];

    Object.keys(EXTERNAL_VIEWERS).forEach(function(identifier) {
        var viewer = EXTERNAL_VIEWERS[identifier];
        var viewerPref = externalViewersPref[identifier];
        if (viewerPref && !viewerPref.enabled) {
            return;
        }
        // Going to be sent to the dialog. The object must be as light as possible.
        externalViewers.push({
            identifier: identifier,
            label: viewer.name
        });
    });
    // Sort alphabetically
    externalViewers.sort(function(a, b) {
        a = a.label.toLocaleLowerCase();
        b = b.label.toLocaleLowerCase();
        return a.localeCompare(b);
    });
}

/**
 * @param mimeTypes {array of string} List of MIME-types
 * @return {array} List of {identifier,name} objects
 */
function getAvailableViewers(mimeTypes) {
    return externalViewers.filter(function(viewerInfo) {
        var r_mime_types = EXTERNAL_VIEWERS[viewerInfo.identifier].r_mime_types;
        for (var i = 0; i < mimeTypes.length; ++i) {
            if (r_mime_types.test(mimeTypes[i])) {
                // The viewer can handle one of the requested mime types.
                return true;
            }
        }
    });
}

/**
 * Open With
 * @param openWithIdentifier {string} Identifier of extension/app that ought to handle this request
 * @param details {object} Object from chrome.webRequest.onHeadersReceived
 * @return {object|undefined} The return value for chrome.webRequest.onHeadersReceived.
 */
function openWith(openWithIdentifier, details) {
    // Original URL
    var url = details.url;
    var viewer = EXTERNAL_VIEWERS[openWithIdentifier];
    if (!viewer) {
        console.warn('Viewer not found for ID ' + openWithIdentifier);
        return;
    }
    var targetUrl = viewer.url.replace(/\$\{([^}]*)\}/g, function(full_match, variable) {
        switch (variable) {
        case 'url':
            return encodeURIComponent(url);
        case 'rawurl':
            return url;
        default: // Unexpected variable. Do not replace.
            return full_match;
        }
    });

    return {
        redirectUrl: targetUrl,
    };
}
})();
