'use strict';
/* exported ContentHandlers */

var ContentHandlers = {};

/**
 * The value of a parsed Content-Type response header.
 * @typedef {object} ParsedContentType
 * @property {string} contentType The original input.
 * @property {string} mimeType
 * @property {string} charset
 */

/**
 * @param {string} contentType The value of the Content-Type response header
 * @returns {ParsedContentType} The parsed value of `contentType`.
 */
ContentHandlers.parseResponseContentType = function(contentType) {
    // TODO: Implement
    // https://searchfox.org/mozilla-central/rev/8a6a6bef7c54425970aa4fb039cc6463a19c0b7f/netwerk/base/nsURLHelper.cpp#978-1030

    // For now, cater for the common case ("type/subtype"):
    let mimeType = contentType.split(';', 1)[0].trim().toLowerCase();
    let charset = '';
    return {contentType, mimeType, charset};
};

/**
 * @param {string} contentType The value of the Content-Type response header.
 * @param {string} [contentEncoding] The value of the Content-Encoding response header.
 * @returns {boolean} Whether the browser would use content sniffing to determine
 *   whether the content is text or binary (download).
 */
ContentHandlers.isSniffableTextPlain = function(contentType, contentEncoding) {
    // Case-sensitive match for some text/plain type, and Content-Encoding should not be present:
    // https://searchfox.org/mozilla-central/rev/091894faeac5b54b7e40b0a304c3d3268f7b645d/netwerk/streamconv/converters/nsUnknownDecoder.cpp#909-933
    return !contentEncoding && (
        contentType === 'text/plain' ||
        contentType === 'text/plain; charset=ISO-8859-1' ||
        contentType === 'text/plain; charset=iso-8859-1' ||
        contentType === 'text/plain; charset=UTF-8');
};

/**
 * @param {string} contentType The value of the Content-Type response header
 * @return {string} An equivalent header where content-sniffing is disabled if possible.
 */
ContentHandlers.makeUnsniffableContentType = function(contentType) {
    if (ContentHandlers.isSniffableTextPlain(contentType)) {
        // Transform the first letter to uppercase to disable sniffing for text/plain.
        return 'T' + contentType.slice(1);
    }

    // TODO: application/octet-stream with media content?
    // For more sniffable types, see https://github.com/Rob--W/open-in-browser/issues/5
    // Otherwise, don't change the Content-Type value.
    return contentType;
};

/** @type {null|Promise<boolean>|boolean} */
var _pdfjsEnabled = null;

/**
 * @param {ParsedContentType} parsedCT
 * @returns {boolean|Promise<boolean>} Whether the given type can be displayed inline.
 *   The return value is usually a boolean, but sometimes a Promise<boolean> if the feature
 *   detection method is aynchronous.
 */
ContentHandlers.canDisplayInline = function(parsedCT) {
    let {mimeType} = parsedCT;
    if (MIME_TYPES_HTML.includes(mimeType) ||
        MIME_TYPES_TEXT.includes(mimeType) ||
        MIME_TYPES_XML.includes(mimeType) ||
        MIME_TYPES_IMAGES.includes(mimeType) ||
        MIME_TYPES_OTHER.includes(mimeType)) {
        return true;
    }

    if (mimeType === 'application/pdf') {
        if (_pdfjsEnabled === null) {
            _pdfjsEnabled = _checkPDFJSEnabled();
            _pdfjsEnabled.then(pdfjsEnabled => {
                _pdfjsEnabled = pdfjsEnabled;
            });
        }
        return _pdfjsEnabled;
    }

    // Media types
    if (mimeType.startsWith('audio/') ||
        mimeType.startsWith('video/') ||
        // https://searchfox.org/mozilla-central/rev/02bc7e2b1bcbab2d7b604ca713b42bcefd47ad2d/dom/media/DecoderTraits.cpp#52-54
        mimeType === 'application/vnd.apple.mpegurl' ||
        mimeType === 'application/x-mpegurl' ||
        // https://searchfox.org/mozilla-central/rev/02bc7e2b1bcbab2d7b604ca713b42bcefd47ad2d/dom/media/ogg/OggDecoder.cpp#24
        mimeType === 'application/ogg' ||
        // https://searchfox.org/mozilla-central/rev/02bc7e2b1bcbab2d7b604ca713b42bcefd47ad2d/dom/media/flac/FlacDecoder.cpp#30
        mimeType === 'application/x-flac') {
        return new Audio().canPlayType(mimeType);
    }
    if (navigator.mimeTypes[mimeType]) {
        // This is a Flash file, and Flash is enabled.
        return true;
    }

    return false;
};

/**
 * @returns {Promise<boolean>} Whether the browser can display PDF files inline.
 */
function _checkPDFJSEnabled() {
    const PDF_DATA = `%PDF
1 0 obj<</Type/Pages/Count 1/Kids[2 0 R]/MediaBox[0 0 1 1]>>endobj
2 0 obj<</Type/Page/Parent 1 0 R>>endobj
3 0 obj<</Type/Catalog/Pages 1 0 R>>endobj
xref
0 4
0000000000 65535 f 
0000000005 00000 n 
0000000072 00000 n 
0000000113 00000 n 
trailer
<</Root 3 0 R/Size 4>>
startxref
156
%%EOF`;
    return new Promise(resolve => {
        var o = document.createElement('object');
        o.type = 'application/pdf';
        o.src = URL.createObjectURL(new Blob([PDF_DATA], {type: 'application/pdf'}));
        o.onload = o.error = function({type}) {
            o.onload = o.onerror = null;
            URL.revokeObjectURL(o.src);
            // Abort load to prevent PDF.js from continuing to parse and load the content.
            o.data = '';
            o.remove();
            resolve(type === 'load');
        };
        setTimeout(function() {
            // If somehow the PDF.js detection method fails to complete within reasonable time,
            // assume that PDFs can be viewed inline (because this is the case by default).
            if (o.onload) {
                o.onload({type: 'load'});
            }
        }, 1000);
        document.body.appendChild(o);
    });
}

// Most of the following types are registered in Firefox to the "Gecko-Content-Viewers" category.
// Some of the types (in MIME_TYPES_OTHER) are stream converters ("@mozilla.org/streamconv;1"),
// content handler ("@mozilla.org/uriloader/content-handler;1") or
// content listener (NS_CONTENT_LISTENER_CATEGORYMANAGER_ENTRY).
const MIME_TYPES_HTML = [
    // https://searchfox.org/mozilla-central/rev/7fb4cc447c06f14fe3b5c6b0c9d103a860937250/layout/build/nsContentDLF.cpp#53-57
    'text/html',
    'application/x-view-source',
    'application/xhtml+xml',
    'application/vnd.wap.xhtml+xml',
];
const MIME_TYPES_TEXT = [
    // https://searchfox.org/mozilla-central/rev/7fb4cc447c06f14fe3b5c6b0c9d103a860937250/dom/base/nsContentUtils.cpp#4306-4330
    'application/javascript',
    'application/x-javascript',
    'text/ecmascript',
    'application/ecmascript',
    'text/javascript',
    'application/json',
    'text/json',
    'text/plain',
    'text/css',
    'text/cache-manifest',
    'text/vtt',
];
const MIME_TYPES_XML = [
    // https://searchfox.org/mozilla-central/rev/7fb4cc447c06f14fe3b5c6b0c9d103a860937250/layout/build/nsContentDLF.cpp#61-66
    'text/xml',
    'application/xml',
    'application/mathml+xml',
    'application/rdf+xml',
    'text/rdf',
];
const MIME_TYPES_IMAGES = [
    // https://searchfox.org/mozilla-central/rev/7fb4cc447c06f14fe3b5c6b0c9d103a860937250/layout/build/nsContentDLF.cpp#71
    'image/svg+xml',
    // https://searchfox.org/mozilla-central/rev/7fb4cc447c06f14fe3b5c6b0c9d103a860937250/image/DecoderFactory.cpp#27-66
    'image/png',
    'image/x-png',
    'image/apng',
    'image/gif',
    'image/jpeg',
    'image/pjpeg',
    'image/jpg',
    'image/bmp',
    'image/x-ms-bmp',
    'image/x-icon',
    'image/vnd.microsoft.icon',
    'image/icon',
];
const MIME_TYPES_OTHER = [
    // https://searchfox.org/mozilla-central/rev/7fb4cc447c06f14fe3b5c6b0c9d103a860937250/layout/build/nsContentDLF.cpp#76-77
    'application/vnd.mozilla.xul+xml',
    'mozilla.application/cached-xul',
    // https://searchfox.org/mozilla-central/rev/7fb4cc447c06f14fe3b5c6b0c9d103a860937250/browser/components/feeds/BrowserFeeds.manifest#12-14
    'application/vnd.mozilla.maybe.feed',
    'application/vnd.mozilla.maybe.video.feed',
    'application/vnd.mozilla.maybe.audio.feed',
    // https://searchfox.org/mozilla-central/rev/7fb4cc447c06f14fe3b5c6b0c9d103a860937250/netwerk/build/nsNetModule.cpp#435-450
    'application/http-index-format',
    'multipart/x-mixed-replace',
    'multipart/mixed',
    'multipart/byteranges',
    // Note: The following type triggers MIME sniffing, and might or might not be displayed inline.
    'application/x-unknown-content-type',
    'application/mac-binhex40',
    // https://searchfox.org/mozilla-central/rev/7fb4cc447c06f14fe3b5c6b0c9d103a860937250/toolkit/mozapps/extensions/extensions.manifest#14
    'application/x-xpinstall',
    // https://searchfox.org/mozilla-central/rev/7fb4cc447c06f14fe3b5c6b0c9d103a860937250/security/manager/ssl/PSMContentListener.cpp#59-68
    // https://searchfox.org/mozilla-central/rev/7fb4cc447c06f14fe3b5c6b0c9d103a860937250/security/manager/ssl/nsNSSModule.cpp#257-260
    'application/x-x509-ca-cert',
    'application/x-x509-server-cert',
    'application/x-x509-user-cert',
    'application/x-x509-email-cert',
];
