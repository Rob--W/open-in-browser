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
 * @param {string} contentType The value of the Content-Type response header
 * @return {string} An equivalent header where content-sniffing is disabled if possible.
 */
ContentHandlers.makeUnsniffableContentType = function(contentType) {
    // Case-sensitive match for some text/plain type:
    // https://searchfox.org/mozilla-central/rev/091894faeac5b54b7e40b0a304c3d3268f7b645d/netwerk/streamconv/converters/nsUnknownDecoder.cpp#909-922
    if (contentType === 'text/plain' ||
        contentType === 'text/plain; charset=ISO-8859-1' ||
        contentType === 'text/plain; charset=iso-8859-1' ||
        contentType === 'text/plain; charset=UTF-8') {
        // Transform the first letter to uppercase to disable sniffing for text/plain.
        return 'T' + contentType.slice(1);
    }

    // TODO: application/octet-stream with media content?
    // For more sniffable types, see https://github.com/Rob--W/open-in-browser/issues/5
    // Otherwise, don't change the Content-Type value.
    return contentType;
};
