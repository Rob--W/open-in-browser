/**
 * (c) 2013 Rob Wu <rob@robwu.nl> (https://robwu.nl)
 */
'use strict';
/* globals EXTERNAL_VIEWERS, EXTERNAL_VIEWERS_EXTENSION_IDS, Prefs, console */
(function() {
window.OpenWith = {
    checkExtensionAvailability: checkExtensionAvailability,
    getAvailableViewers: getAvailableViewers,
    openWith: openWith
};

// Which viewers are enabled, i.e. should show up in the dropdown box?
var externalViewers = [];

// Is the extension installed?
var enabledViewerExtensions = {};

Prefs.setPrefHandler('external-viewers', updateExternalViewersInfo);
function updateExternalViewersInfo() {
    var externalViewersPref = Prefs.get('external-viewers');
    externalViewers = [];

    Object.keys(EXTERNAL_VIEWERS).forEach(function(identifier) {
        var viewer = EXTERNAL_VIEWERS[identifier];
        var viewerPref = externalViewersPref[identifier];
        // TODO: Remove preferences (why would one disable the viewers?)
        if (viewerPref && !viewerPref.enabled) {
            // Extensions are blacklisted by default (need to detect whether they're available)
            // Viewers that are explicitly not enabled should be hidden as well.
            return;
        }
        // Going to be sent to the dialog. The object must be as light as possible.
        externalViewers.push({
            identifier: identifier,
            // TODO: If extension, show name obtained from chrome.management API?
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

function checkExtensionAvailability() {
    chrome.extensions.getAll(function(result) {
        result.forEach(_checkExtensionInfo);
    });
    if (!checkExtensionAvailability.hasRun) {
        checkExtensionAvailability.hasRun = true;
        chrome.management.onEnabled.addListener(_checkExtensionInfo);
        chrome.management.onDisabled.addListener(_checkExtensionInfo);
        chrome.management.onInstalled.addListener(_checkExtensionInfo);
        chrome.management.onUninstalled.addListener(_forgetViewerExtension);
    }
}
function _checkExtensionInfo(extensionInfo) {
    if (!EXTERNAL_VIEWERS_EXTENSION_IDS.hasOwnProperty(extensionInfo.id)) {
        return;
    }
    if (extensionInfo.enabled) {
        enabledViewerExtensions[extensionInfo.id] = true;
        console.log('Found extension: ' + extensionInfo.id + '  ' + extensionInfo.name);
    } else {
        _forgetViewerExtension(extensionInfo.id);
    }
    updateExternalViewersInfo();
}
function _forgetViewerExtension(extensionid) {
    delete enabledViewerExtensions[extensionid];
    console.log('Forgot extension: ' + extensionid);
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
        case 'extensionid':
            for (var i = 0; i < viewer.extensionids.length; ++i) {
                var extensionid = viewer.extensionids[i];
                if (enabledViewerExtensions.hasOwnProperty(extensionid))
                    return extensionid;
            }
            return viewer.extensionids[0]; // None enabled...? Just use the first listed id.
        default: // Unexpected variable. Do not replace.
            return full_match;
        }
    });

    return {
        redirectUrl: targetUrl,
    };
}
})();
