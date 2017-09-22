/**
 * (c) 2013 Rob Wu <gwnRob@gmail.com>
 *
 * Simple i18n module
 * Finds all data-i18n attributes in the document, and updates the DOM properties.
 *
 * Format:
 *  data-i18n="value = i18n_identifier; title = i18n_identifier2 ; i18n_identifier3"
 *
 * - Whitespace between around "=" and ";" is not significant.
 * - When an i18n identifier is found without "=", the default property is used:
 *   "label" for <option>
 *   "value" for <input>
 *   "textContent" otherwise
 *
 */

'use strict';
/* globals chrome, console */
if (!chrome.i18n) {
    // chrome.i18n is usually undefined when the page is loaded with showModalDialog
    chrome.i18n = window.opener && window.opener.chrome && window.opener.chrome.i18n;
}
if (!chrome.i18n) {
    console.warn('chrome.i18n is undefined.');
} else
(function doTranslateDocument() {
    var elements = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < elements.length; ++i) {
        var element = elements[i];
        var i18n_tokens = element.dataset.i18n.split(';');
        for (var j = 0; j < i18n_tokens.length; ++j) {
            var pair = i18n_tokens[j].split('=');
            var domProp, i18n_id;
            if (pair.length === 1) {
                // Didn't specify type, try to detect
                var nodeName = element.nodeName.toUpperCase();
                domProp = nodeName === 'OPTION' ? 'label' :
                          nodeName === 'INPUT' ? 'value' :
                          'textContent';
                i18n_id = pair[0].trim();
            } else if (pair.length === 0) {
                continue;
            } else { // 2+
                domProp = pair[0].trim();
                i18n_id = pair[1].trim();
            }
            var translation = chrome.i18n.getMessage(i18n_id);
            if (translation) {
                element[domProp] = translation;
            } else {
                console.warn('i18n: Translation not found for: ' + i18n_id);
            }
        }
    }
})();
