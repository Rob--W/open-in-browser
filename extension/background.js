/**
 * (c) 2013 Rob Wu <rob@robwu.nl> (https://robwu.nl)
 */
/* globals Prefs, MimeActions, mime_fromFilename, ModalDialog, OpenWith, ContentHandlers */
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
    var originalCT = ContentHandlers.parseResponseContentType(
        getHeader(details.responseHeaders, 'content-type') || '');
    var contentDisposition = getHeader(details.responseHeaders, 'content-disposition');
    var {mimeType} = originalCT;

    if (!contentDisposition || !r_contentDispositionAttachment.test(contentDisposition)) {
        // Content disposition != attachment. Let's take a look at the MIME-type.
        if (!shouldInterceptRequest(mimeType)) {
            if (Prefs.get('text-nosniff')) {
                let unsniffableContentType = ContentHandlers.makeUnsniffableContentType(originalCT);
                if (unsniffableContentType !== originalCT.contentType) {
                    setHeader(details.responseHeaders, 'Content-Type', unsniffableContentType);
                    return {
                        responseHeaders: details.responseHeaders
                    };
                }
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
        mimeType === 'text/plain' && !Prefs.get('text-nosniff')) {
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
            openWithOptions: OpenWith.getAvailableViewers([mimeType, guessedMimeType])
        };
        var dialog = new ModalDialog({
            url: dialogURL + '#' + encodeURIComponent(JSON.stringify(dialogArguments)),
            incognito: details.incognito,
        });
        var isAborted = false; // Close dialog if user aborts request
        var onErrorOccurred = function(errorDetails) {
            if (errorDetails.requestId === details.requestId) {
                isAborted = true;
                dialog.close();
            }
        };
        chrome.webRequest.onErrorOccurred.addListener(onErrorOccurred, {
            urls: ['*://*/*'],
            types: [details.type],
            tabId: details.tabId
        });
        // Firefox does not generate a webRequest error when the user aborts the load.
        // So use webNavigation.onErrorOccurred instead, which seems to emit an error
        // with errorDetails.error = "Error code 2152398850", aka NS_BINDING_ABORTED.
        var onNavigationErrorOccurred = function(errorDetails) {
            if (errorDetails.tabId === details.tabId &&
                errorDetails.frameId === details.frameId &&
                errorDetails.url === details.url) {
                isAborted = true;
                dialog.close();
            }
        };
        chrome.webNavigation.onErrorOccurred.addListener(onNavigationErrorOccurred);
        desiredAction = await dialog.show();
        chrome.webRequest.onErrorOccurred.removeListener(onErrorOccurred);
        chrome.webNavigation.onErrorOccurred.removeListener(onNavigationErrorOccurred);
        if (isAborted) return;
    }
    if (desiredAction) {
        if (desiredAction.mime) {
            let desiredCT = ContentHandlers.parseResponseContentType(desiredAction.mime);
            setHeader(details.responseHeaders, 'Content-Type',
                ContentHandlers.makeUnsniffableContentType(desiredCT));
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
            return OpenWith.openWith(desiredAction.openWith, details);
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


// The next MIME types are always rendered inline.
var MIME_TYPES_BUILTIN = [
// Chrome extension
// TODO: Consider removing the CRX MIME-typ and integrate https://github.com/Rob--W/crxviewer
    'application/x-chrome-extension',
// mime_util.cc  supported_image_types
    'image/jpeg',
    'image/pjpeg',
    'image/jpg',
    'image/webp',
    'image/png',
    'image/gif',
    'image/bmp',
    'image/vnd.microsoft.icon',
    'image/x-icon',
    'image/x-xbitmap',
// mime_util.cc  common_media_types
    'audio/ogg',
    'application/ogg',
    'video/ogg',
    'video/webm',
    'audio/webm',
    'audio/wav',
    'audio/x-wav',
    'video/mp4',
    'video/x-m4v',
    'audio/mp4',
    'audio/x-m4a',
    'audio/mp3',
    'audio/x-mp3',
    'audio/mpeg',
// mime_util.cc  supported_non_image_types
    'text/cache-manifest',
    'text/html',
    'text/xml',
    'text/xsl',
    'text/plain',
    'text/css',
    'text/vnd.chromium.ftp-dir',
//  'text/', // special case; handled below (TODO)
    'image/svg+xml',
    'application/xml',
    'application/atom+xml',
    'application/rss+xml',
    'application/xhtml+xml',
    'application/json',
    'multipart/related',
    'multipart/x-mixed-replace',
// mime_util.cc  supported_certificate_types
    'application/x-x509-user-cert',
// mime_util.cc  supported_javascript_types
    'text/javascript',
    'text/ecmascript',
    'application/javascript',
    'application/ecmascript',
    'application/x-javascript',
    'text/javascript1.1',
    'text/javascript1.2',
    'text/javascript1.3',
    'text/jscript',
    'text/livescript'
];

// Chrome renders text/* as text (inline), except in the following cases:
var MIME_TYPES_TEXT_SPECIAL_CASE = [
// mime_util.cc  unsupported_text_types
    'text/calendar',
    'text/x-calendar',
    'text/x-vcalendar',
    'text/vcalendar',
    'text/vcard',
    'text/x-vcard',
    'text/directory',
    'text/ldif',
    'text/qif',
    'text/x-qif',
    'text/x-csv',
    'text/x-vcf',
    'text/rtf',
    'text/comma-separated-values',
    'text/csv',
    'text/tab-separated-values',
    'text/tsv',
    'text/ofx',
    'text/vnd.sun.j2me.app-descriptor'
];

/**
 * Determines whether or not to intercept the request
 *
 * @param {string} mimeType The value of the Content-Type header
 * @return {boolean} Whether to intercept the request and show the prompt.
 */
function shouldInterceptRequest(mimeType) {
    if (!mimeType) {
        // Mime-type not specified. For now, do nothing.
        return false;
    }
    if (mimeType.slice(0, 5) === 'text/') {
        // return true for Ignore text/*, unless Chromium's source code states that
        // the particular text/... MIME-type should not be rendered as text.
        return MIME_TYPES_TEXT_SPECIAL_CASE.indexOf(mimeType) !== -1;
    }
    if (MIME_TYPES_BUILTIN.indexOf(mimeType) !== -1) {
        // Chrome will certainly inline these MIME-types.
        return false;
    }
    return true;
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
