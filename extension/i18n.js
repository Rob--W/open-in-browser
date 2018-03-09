/**
 * (c) 2013 Rob Wu <rob@robwu.nl> (https://robwu.nl)
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
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
(function doTranslateDocument() {
    // For now, assume Firefox. The extension does not work in Chrome because
    // of lack of support for async return values in webRequest events.
    const DEFAULT_BRAND_SHORT_NAME = 'Firefox';

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
            if (i18n_id === 'brandShortName') {
                setBrandedTranslation(element, domProp, 'brandShortName');
                continue;
            }
            var translation = chrome.i18n.getMessage(i18n_id);
            if (translation) {
                if (translation.includes('brandShortName')) {
                    setBrandedTranslation(element, domProp, translation);
                } else {
                    element[domProp] = translation;
                }
            } else {
                console.warn('i18n: Translation not found for: ' + i18n_id);
            }
        }
    }

    var brandShortName;
    function setBrandedTranslation(element, domProp, translation) {
        if (brandShortName) {
            element[domProp] = translation.replace(/brandShortName/g, brandShortName);
            return;
        }
        // Set default, synchronously.
        element[domProp] = translation.replace(/brandShortName/g, DEFAULT_BRAND_SHORT_NAME);

        // Asynchronously determine whether we are using Firefox Nightly. If so, replace
        // "Firefox" with "Nightly".
        if (chrome.runtime.getBrowserInfo) {
            chrome.runtime.getBrowserInfo(function({name, version}) {
                if (name === 'Firefox' && /a\d*$/.test(version)) {
                    brandShortName = 'Nightly';
                } else {
                    brandShortName = name;
                }
                setBrandedTranslation(element, domProp, translation);
            });
        }
    }
})();
