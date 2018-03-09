/**
 * (c) 2013 Rob Wu <rob@robwu.nl> (https://robwu.nl)
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals Prefs, MimeActions, mime_fromFilename, ModalDialog, ContentHandlers */
/* globals getFilenameFromContentDispositionHeader */
'use strict';

var dialogURL = chrome.extension.getURL('dialog.html');

var gForceDialog = 0;
var gForceDialogAllFrames = false;
var gForceDialogAllTabs = false;
var gLastActionIsDownload = null;

Prefs.init();

chrome.webRequest.onHeadersReceived.addListener(async function(details) {
    if (details.statusLine.substring(9, 12) !== '200') { // E.g. HTTP/0.9 200 OK
        // Ignore all non-OK HTTP response
        return;
    }
    if (details.tabId === -1) {
        // Ignore requests that did not originate from a tab, such as requests from
        // Firefox's page thumnail component - https://github.com/Rob--W/open-in-browser/issues/20
        return;
    }
    var abortionObserver = createWebRequestAbortionObserver(details);
    var originalCT = ContentHandlers.parseResponseContentType(
        getHeader(details.responseHeaders, 'content-type'));
    var contentDisposition = getHeader(details.responseHeaders, 'content-disposition');
    var isSniffingTextPlain = ContentHandlers.isSniffableTextPlain(originalCT.contentType,
        getHeader(details.responseHeaders, 'content-encoding'));
    var contentLength = getHeader(details.responseHeaders, 'content-length');
    if (contentLength !== undefined) contentLength = parseInt(contentLength);
    contentLength = contentLength >= 0 ? contentLength : -1;
    var {mimeType} = originalCT;

    var needsDialog = contentDisposition && /^\s*attachment/i.test(contentDisposition);
    var forceDialog = false;
    if (gForceDialog > 0) {
        forceDialog = gForceDialogAllFrames || details.type === 'main_frame';
        if (forceDialog && !gForceDialogAllTabs) {
            abortionObserver.setupBeforeAsyncTask(null);
            let {active} = await browser.tabs.get(details.tabId).catch(() => ({active: false}));
            if (!abortionObserver.continueAfterAsyncTask()) return;
            if (!active) forceDialog = false;
        }
        // Need to check "gForceDialog > 0" condition again because it is possible for multiple
        // requests to be send while we were asynchronously determining the tab active state.
        if (forceDialog && gForceDialog > 0) {
            if (!--gForceDialog) {
                browser.menus.update('MENU_OIB_ONCE', {checked: false});
            }
        } else {
            forceDialog = false;
        }
    }

    if (!needsDialog && !forceDialog) {
        // Content disposition != attachment. Let's take a look at the MIME-type.
        let canDisplayInline = ContentHandlers.canDisplayInline(originalCT);
        if (typeof canDisplayInline !== 'boolean') {
            abortionObserver.setupBeforeAsyncTask(null);
            canDisplayInline = await canDisplayInline;
            if (!abortionObserver.continueAfterAsyncTask()) return;
        }
        if (canDisplayInline) {
            if (isSniffingTextPlain) {
                if (Prefs.get('text-nosniff')) {
                    setHeader(details.responseHeaders, 'Content-Type',
                        ContentHandlers.makeUnsniffableContentType(originalCT.contentType));
                    return {
                        responseHeaders: details.responseHeaders
                    };
                }
                // TODO: Use webRequest.filterResponseData to peek in the response and detect
                // whether the content is to be detected as text or binary.
                // If binary, show the custom "Open in Browser" dialog.
                // For implementation details, see
                // https://github.com/Rob--W/open-in-browser/issues/5
                return;
            }
            // Uncertain whether MIME-type triggers download. Exit now, to be on the safe side.
            return;
        }
        if (contentLength <= 0 && !mimeType) {
            // No specified content type, so defaulting to content sniffing.
            // There is however no content to sniff, so do not show a dialog.
            return;
        }
        if (!mimeType && details.type === 'sub_frame') {
            // No specified content type, so defaulting to content sniffing.
            // Do not show a dialog, in case the result would be sniffed to an inlineable type.
            // It is probably more likely for a response to be sniffed as an inlineable type
            // than a downloadable type. If the sniffer would normally trigger a Save As dialog,
            // then it is most likely that the user intents to save the result. In this case,
            // Firefox's default Save As dialog will meet the user's needs.
            return;
        }
    }

    // Determine file name
    var filename;
    if (contentDisposition) {
        filename = getFilenameFromContentDispositionHeader(contentDisposition);
    }
    if (!filename) {
        filename = getFilenameFromURL(details.url);
    }

    var guessedMimeType = mime_fromFilename(filename) || mimeType;
    var isSniffingMimeType =
        mimeType === 'application/octet-stream' && Prefs.get('octet-sniff-mime');

    var desiredAction = Prefs.getMimeAction(guessedMimeType, isSniffingMimeType, mimeType);
    if (!desiredAction.action) {
        var dialogArguments = {
            desiredAction: desiredAction,
            url: details.url,
            filename: filename,
            contentLength: contentLength,
            contentType: originalCT.contentType,
            guessedMimeType: guessedMimeType,
            mimeType: mimeType,
            isSniffingMimeType: isSniffingMimeType,
            forceDownload: gLastActionIsDownload === null ? !!needsDialog : gLastActionIsDownload,
        };
        var dialog = new ModalDialog({
            url: dialogURL + '#' + encodeURIComponent(JSON.stringify(dialogArguments)),
            incognito: details.incognito,
        });
        abortionObserver.setupBeforeAsyncTask(() => { dialog.close(); });
        desiredAction = await dialog.show();
        if (!abortionObserver.continueAfterAsyncTask()) return;
    }
    if (desiredAction) {
        if (desiredAction.mime) {
            let desiredCT = ContentHandlers.parseResponseContentType(desiredAction.mime);
            setHeader(details.responseHeaders, 'Content-Type',
                ContentHandlers.makeUnsniffableContentType(desiredCT.contentType));
            setHeader(details.responseHeaders, 'Content-Disposition', 'inline');
        }
        gLastActionIsDownload = desiredAction.action === MimeActions.DOWNLOAD;
        if (desiredAction.action === MimeActions.DOWNLOAD) {
            if (Prefs.get('override-download-type')) {
                // Override download type to a non-existent type, presumably part of the
                // "browser.helperApps.neverAsk.saveToDisk" pref (as explained in options.html).
                // This type is chosen as follows:
                // 1. The type is short but explanatory, so that those who encounter the preference
                //    in the future can remember what the pref is doing.
                // 2. The type is not registered in an external MIME handler
                //    (= I created a new MIME type that no other application should handle).
                //    Relevant code: https://searchfox.org/mozilla-central/rev/a5d613086ab4d0578510aabe8653e58dc8d7e3e2/uriloader/exthandler/nsExternalHelperAppService.cpp#1685-1704
                setHeader(details.responseHeaders, 'Content-Type', 'application/prs.oib-ask-once');
            }
            if (contentDisposition) {
                setHeader(details.responseHeaders, 'Content-Disposition',
                    contentDisposition.replace(/^[^;]*(;?)/, 'attachment$1'));
            } else {
                setHeader(details.responseHeaders, 'Content-Disposition', 'attachment');
            }
        }
        if (desiredAction.rememberChoice) {
            Prefs.setMimeAction(guessedMimeType, isSniffingMimeType, desiredAction);
        }
        if (desiredAction.action === MimeActions.OPENWITH) {
            // Don't modify the response headers and let the browser handle the request.
            return;
        }
        return {
            responseHeaders: details.responseHeaders
        };
    } else {
        // Closed dialog or pressed abort
        return { redirectUrl: 'javascript:' };
    }
}, {
    urls: ['*://*/*'],
    types: ['main_frame', 'sub_frame']
}, ['blocking', 'responseHeaders']);

browser.menus.create({
    id: 'MENU_OIB_ONCE',
    contexts: ['tools_menu'],
    title: 'Enable for next request',
    checked: false,
    type: 'checkbox',
    onclick(info) {
        gForceDialog = info.checked ? 1 : 0;
    },
});

browser.menus.create({
    id: 'MENU_OIB_FOREVER',
    contexts: ['tools_menu'],
    title: 'Enable for all requests',
    checked: false,
    type: 'checkbox',
    onclick(info) {
        gForceDialog = info.checked ? Infinity : 0;
        // If enabled forever, "enable for next request" does not make sense.
        browser.menus.update('MENU_OIB_ONCE', {
            enabled: !info.checked,
            checked: false,
        });
    },
});

browser.menus.create({
    id: 'MENU_OIB_ACTIVE_TABS',
    contexts: ['tools_menu'],
    title: 'Include requests from all tabs',
    checked: false,
    type: 'checkbox',
    onclick(info) {
        gForceDialogAllTabs = info.checked;
    },
});

browser.menus.create({
    id: 'MENU_OIB_ALL_FRAMES',
    contexts: ['tools_menu'],
    title: 'Include requests from frames',
    checked: false,
    type: 'checkbox',
    onclick(info) {
        gForceDialogAllFrames = info.checked;
    },
});

browser.menus.create({
    id: 'MENU_OIB_PREFS',
    contexts: ['tools_menu'],
    title: 'Preferences',
    onclick() {
        browser.runtime.openOptionsPage();
    },
});

/**
 * Get the value of a header from the list of headers for a given name.
 *
 * @param {Array} headers responseHeaders of webRequest.onHeadersReceived
 * @param {string} headerName The lowercase name of the header to look for.
 * @return {string} The value of the header, if found. Empty string otherwise.
 */
function getHeader(headers, headerName) {
    for (var i = headers.length - 1; i >= 0; --i) {
        var header = headers[i];
        if (header.name.toLowerCase() === headerName) {
            return header.value || header.binaryValue;
        }
    }
    return '';
}

/**
 * Adds or replaces a header
 *
 * @param {Array} headers responseHeaders of webRequest.onHeadersReceived
 *                        The contents of the array may be modified.
 */
function setHeader(headers, headerName, headerValue) {
    var lowerCaseHeaderName = headerName.toLowerCase();
    for (var i = headers.length - 1; i >= 0; --i) {
        var header = headers[i];
        if (header.name.toLowerCase() === lowerCaseHeaderName) {
            headers.splice(i, 1);
        }
    }
    headers.push({
        name: headerName,
        value: headerValue
    });
}

/**
 * Derive file name from URL
 *
 * @param {string} An URL
 * @return {string} A file name
 */
function getFilenameFromURL(url) {
    url = url.split(/[?#]/, 1)[0];
    var filename = url.match(/([^/]+)[/ ]*$/)[1];
    try {
        filename = decodeURIComponent(filename);
    } catch(e) {/* URIError */}
    return filename;
}

/**
 * Observe when a request is aborted. Mainly useful to detect whether a request is still alive after
 * executing a potentially long asynchronous task.
 * Usage:
 *
 * var abortionObserver = createWebRequestAbortionObserver(details);
 * abortionObserver.setupBeforeAsyncTask();
 * await someLongRunningTask();
 * // If continueAfterAsyncTask returns false, then the request was aborted.
 * if (!abortionObserver.continueAfterAsyncTask()) return;
 *
 * setupBeforeAsyncTask can be passed a function, which is called if the request was aborted
 * before continueAfterAsyncTask is called.
 *
 * @param {object} details WebRequest event details.
 * @return {object} An object with properties "aborted", "setupBeforeAsyncTask" and
 *  "continueAfterAsyncTask". See the above example.
 */
function createWebRequestAbortionObserver(details) {
    var callbackOnPrematureAbort = null;
    var isAborted = false;
    function onErrorOccurred(errorDetails) {
        if (errorDetails.requestId === details.requestId) {
            if (errorDetails.error === 'NS_ERROR_NET_ON_RECEIVING_FROM') {
                // This "error" is triggered even when the request has not been
                // aborted. So ignore this "error".
                // https://github.com/Rob--W/open-in-browser/issues/28
                // https://bugzil.la/1420917
                return;
            }
            onAborted();
        }
    }
    // Firefox does not generate a webRequest error when the user aborts the load.
    // So use webNavigation.onErrorOccurred instead, which seems to emit an error
    // with errorDetails.error = "Error code 2152398850", aka NS_BINDING_ABORTED.
    function onNavigationErrorOccurred(errorDetails) {
        if (errorDetails.tabId === details.tabId &&
            errorDetails.frameId === details.frameId &&
            errorDetails.url === details.url) {
            onAborted();
        }
    }

    function onAborted() {
        isAborted = true;
        stopListening();
        if (callbackOnPrematureAbort) {
            callbackOnPrematureAbort();
            callbackOnPrematureAbort = null;
        }
    }

    function stopListening() {
        chrome.webRequest.onErrorOccurred.removeListener(onErrorOccurred);
        chrome.webNavigation.onErrorOccurred.removeListener(onNavigationErrorOccurred);
    }


    function setupBeforeAsyncTask(onAborted) {
        callbackOnPrematureAbort = onAborted;
        chrome.webRequest.onErrorOccurred.addListener(onErrorOccurred, {
            urls: ['*://*/*'],
            types: [details.type],
            tabId: details.tabId
        });
        chrome.webNavigation.onErrorOccurred.addListener(onNavigationErrorOccurred);
    }

    function continueAfterAsyncTask() {
        callbackOnPrematureAbort = null;
        stopListening();
        return !isAborted;
    }

    return {
        get aborted() { return isAborted; },
        setupBeforeAsyncTask,
        continueAfterAsyncTask,
    };
}
