/**
 * (c) 2013 Rob Wu <rob@robwu.nl> (https://robwu.nl)
 */
/* globals Prefs, MimeActions, mime_fromFilename, ModalDialog, ContentHandlers */
'use strict';

var dialogURL = chrome.extension.getURL('dialog.html');
var r_contentDispositionAttachment = /^\s*attachment/;
var r_contentDispositionFilename = /[; ]filename(\*?)=(["']?)(.+)\2/;

Prefs.init();

chrome.webRequest.onHeadersReceived.addListener(async function(details) {
    if (details.statusLine.substring(9, 12) !== '200') { // E.g. HTTP/0.9 200 OK
        // Ignore all non-OK HTTP response
        return;
    }
    var abortionObserver = createWebRequestAbortionObserver(details);
    var originalCT = ContentHandlers.parseResponseContentType(
        getHeader(details.responseHeaders, 'content-type') || '');
    var contentDisposition = getHeader(details.responseHeaders, 'content-disposition');
    var isSniffingTextPlain = ContentHandlers.isSniffableTextPlain(originalCT.contentType,
        getHeader(details.responseHeaders, 'content-encoding'));
    var {mimeType} = originalCT;

    if (!contentDisposition || !r_contentDispositionAttachment.test(contentDisposition)) {
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
    }

    // Determine file name
    var filename;
    if (contentDisposition) {
        filename = getFilenameFromContentDispositionHeader(contentDisposition);
    }
    if (!filename) {
        filename = getFilenameFromURL(details.url);
    }
    var guessedMimeType = mimeType;
    var isSniffingMimeType = false;
    if (mimeType === 'application/octet-stream' && Prefs.get('octet-sniff-mime') ||
        isSniffingTextPlain && !Prefs.get('text-nosniff')) {
        // application/octet-stream is commonly used for anything, "to trigger a download"
        // text/plain is subject to Chrome's MIME-sniffer
        guessedMimeType = mime_fromFilename(filename) || mimeType;
        isSniffingMimeType = true;
    }

    var desiredAction = Prefs.getMimeAction(guessedMimeType, isSniffingMimeType, mimeType);
    if (!desiredAction.action) {
        var dialogArguments = {
            desiredAction: desiredAction,
            url: details.url,
            filename: filename,
            contentType: originalCT.contentType,
            guessedMimeType: guessedMimeType,
            mimeType: mimeType,
            isSniffingMimeType: isSniffingMimeType,
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
        if (desiredAction.action === MimeActions.DOWNLOAD) {
            setHeader(details.responseHeaders, 'Content-Disposition',
                    'attachment; filename*=UTF-8\'\'' + encodeURIComponent(filename));
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

/**
 * Get the value of a header from the list of headers for a given name.
 * @param {Array} headers responseHeaders of webRequest.onHeadersReceived
 * @return {undefined|{name: string, value: string}} The header, if found.
 */
function getHeader(headers, headerName) {
    headerName = headerName.toLowerCase();
    for (var i = 0; i < headers.length; ++i) {
        var header = headers[i];
        if (header.name.toLowerCase() === headerName) {
            return header.value || header.binaryValue;
        }
    }
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
 * Extract file name from Content-Disposition header
 *
 * @param {string} contentDisposition
 * @return {string} Filename, if found in the Content-Disposition header.
 */
function getFilenameFromContentDispositionHeader(contentDisposition) {
    contentDisposition = r_contentDispositionFilename.exec(contentDisposition);
    if (contentDisposition) {
        var filename = contentDisposition[3];
        if (contentDisposition[1]) { // "*" in "filename*=" (RFC 5987)
            filename = filename.replace(/^[^']+'[^']*'/, '');
        }
        try {
            filename = decodeURIComponent(filename);
        } catch (e) {/* URIError */}
        return filename;
    }
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
