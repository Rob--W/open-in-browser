/**
 * (c) 2013 Rob Wu <gwnRob@gmail.com>
 */
(function() {
'use strict';
window.openWith = openWith;

/**
 * Open With
 * @param openWithIdentifier {string} Identifier of extension/app that ought to handle this request
 * @param details {object} Object from chrome.webRequest.onHeadersReceived
 */
function openWith(openWithIdentifier, details) {
    // Original URL
    var url = details.url;
    // TODO: Actually use openWithIdentifier to redirect elsewhere.
    var targetUrl = url + '?';

    navigateToUrl(details.tabId, details.frameId, targetUrl);
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
