/**
 * (c) 2013 Rob Wu <gwnRob@gmail.com>
 */
/* globals EXTERNAL_VIEWERS, EXTERNAL_VIEWERS_EXTENSION_IDS, Prefs, console */
(function() {
'use strict';
window.OpenWith = {
    checkExtensionAvailability: checkExtensionAvailability,
    getAvailableViewers: getAvailableViewers,
    // openWith depends on chrome.tabs.executeScriptInTab.js
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
 * @return {boolean} Whether openWithIdentifier was recognized as a valid app identifier.
 */
function openWith(openWithIdentifier, details) {
    // Original URL
    var url = details.url;
    var viewer = EXTERNAL_VIEWERS[openWithIdentifier];
    if (!viewer) {
        console.warn('Viewer not found for ID ' + openWithIdentifier);
        return false;
    }
    var targetUrl = viewer.url.replace(/\$\{([^}]*)\}/, function(full_match, variable) {
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

    navigateToUrl(details.tabId, details.frameId, targetUrl);
    return true;
}

/**
 * Load a new URL in a given frame/tab.
 */
function navigateToUrl(tabId, frameId, url) {
    if (frameId === 0) { // Main frame
        chrome.tabs.update(tabId, {
            url: url
        });
        return;
    }
    // Use meta-refresh redirection to blank the frame's content before navigating
    // to a different page. Otherwise, the user might see "This page is blocked by ...",
    // which is confusing (use case of this method: Abort a request and redirect to new URL).
    // Note: This whole method (navigateToUrl) will be obsolete once redirectUrl is implemented
    // for onHeadersReceived - see https://code.google.com/p/chromium/issues/detail?id=280464
    var code = 'location.href = \'data:text/html,<meta http-equiv="refresh" content="0;' +
             url.replace(/"/g, '&quot;') + '">\';';
    // https://github.com/Rob--W/chrome-api/tree/master/chrome.tabs.executeScriptInFrame
    chrome.tabs.executeScriptInTab(tabId, {
        frameId: frameId,
        code: code
    }, function(result) {
        if (!result) { // Did the tab disappear? Is the frame inaccessible?
            chrome.tabs.create({
                url: url
            });
        }
    });
}
})();
