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
