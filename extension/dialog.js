/**
 * (c) 2013 Rob Wu <rob@robwu.nl> (https://robwu.nl)
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals console,
            mimeMetadata,
            mime_getFriendlyName,
            mime_getIcon,
            MimeActions
 */
'use strict';
var $ = document.getElementById.bind(document);

var dialogArguments = JSON.parse(decodeURIComponent(window.location.hash.slice(1)));
handleDetails(dialogArguments);

function handleDetails({
    url,
    filename,
    contentLength,
    isSniffingMimeType,
    guessedMimeType,
    mimeType,
}) {
    // Note: There is so much junk before the title that it is often unreadable,
    // at least until https://bugzil.la/1296365 is fixed.
    document.title = chrome.i18n.getMessage('opening_title', filename);

    renderMetadata(filename, contentLength, isSniffingMimeType, guessedMimeType, mimeType);

    renderURL(url);

    bindFormEvents();

    bindPreferenceEvents();

    bindDialogEvents();

    resizeDialog(/*moveDialog=*/ true);

    if (!chrome.extension.inIncognitoContext) {
        // This dialog should not appear in the browser history.
        chrome.history.deleteUrl({url: location.href});
    }
}

function bindDialogEvents() {
    window.addEventListener('keydown', function(e) {
        if (e.altKey || e.altGraphKey) {
            return;
        }
        var ctrlKey = e.ctrlKey || e.metaKey;
        if (e.keyIdentifier === 'F5' || e.keyCode === 82/*R*/ && ctrlKey) {
            // F5 / Ctrl + F5 / Ctrl + R / Ctrl + Shift + R
            e.preventDefault();
        }
        if (e.keyCode === 27/*Esc*/ && !ctrlKey && !e.shiftKey) {
            // Esc
            e.preventDefault();
            window.returnValue = undefined;
            closeDialog();
        }
    }, true);
    window.oncontextmenu = function(e) {
        if (!e.target || e.target.type !== 'text') {
            // Allow right-click on <input type=text> for copy-paste.
            e.preventDefault();
        }
    };
}

var deferredResizeDialog;
function resizeDialog(/*boolean*/ moveDialog) {
    clearTimeout(deferredResizeDialog);
    var WIDTH = 500;
    var innerHeight = window.innerHeight;
    if (innerHeight === 0) { // innerHeight = 0 shortly after page load.
        deferredResizeDialog = setTimeout(resizeDialog, 20, moveDialog);
        return;
    }
    var outerHeight = window.outerHeight;
    var verticalDialogPadding = outerHeight - innerHeight;
    if (verticalDialogPadding <= 0) { // Value of outerHeight is ****ing unreliable.
        verticalDialogPadding = 40;   // Chrome on Linux = 27, Chrome on OS X = 22.
        console.log('Detected a non-positive height of the window chrome. This is impossible. ' +
                    'Using verticalDialogPadding = ' + verticalDialogPadding + ' as fallback.');
    } else {
        // If verticalDialogPadding is reliable, assume that outerWidth is also reliable.
        WIDTH = Math.max(WIDTH, window.outerWidth);
    }

    var dialogMain = $('dialog-main');
    dialogMain.style.minWidth = WIDTH + 'px';
    var HEIGHT = dialogMain.scrollHeight + verticalDialogPadding;
    dialogMain.style.minWidth = '';

    // Note: A side effect of resizing the window is that we work around a bug where
    // the window is initially painted blank. https://bugzil.la/1408446
    if (moveDialog === true) {
        var updateInfo = {
            width: WIDTH,
            height: HEIGHT,
            left: screen.left + Math.floor((screen.availWidth - WIDTH) / 2),
            top: screen.top + Math.floor((screen.availHeight - HEIGHT) / 2),
        };
        // Without an explicit top/left position, Firefox aligns popups on the center of the screen.
        // https://searchfox.org/mozilla-central/rev/fe75164c55321e011d9d13b6d05c1e00d0a640be/browser/components/extensions/ext-windows.js#154
        // If our size estimate was good, then the position is close to the desired position.
        if (Math.abs(window.screenX - updateInfo.left) < 10 &&
            Math.abs(window.screenY - updateInfo.top) < 10) {
            // If the size difference is small, then the exact position will also be close to the
            // desired position, so do not move the dialog to allow the window manager to take care
            // of choosing an appropriate position.
            delete updateInfo.left;
            delete updateInfo.top;
        }
        chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, updateInfo, function() {
            resizeDialog(false);
        });
    } else {
        // Work-around for https://github.com/Rob--W/open-in-browser/issues/29
        document.body.style.overflow = 'hidden';
        chrome.windows.update(chrome.windows.WINDOW_ID_CURRENT, {
            width: WIDTH,
            height: HEIGHT,
        }, function() {
            setTimeout(function() {
                document.body.style.overflow = '';
            });
        });
    }
}

function renderMetadata(filename, contentLength, isSniffingMimeType, guessedMimeType, mimeType) {
    var effectiveMimeType = isSniffingMimeType ? guessedMimeType : mimeType;
    $('filename').textContent = filename;
    $('filename').title = filename;

    $('content-type').textContent =
        formatTypeAndSize(
            mime_getFriendlyName(effectiveMimeType) || effectiveMimeType,
            contentLength);

    var mimeTooltip = 'Server-sent MIME: ' + mimeType;
    if (guessedMimeType !== mimeType) {
        mimeTooltip += '\nBased on file extension: ' + guessedMimeType;
    }
    $('content-type').title = mimeTooltip;

    $('metadata-block').style.backgroundImage = 'url("' + mime_getIcon(effectiveMimeType) + '")';

    if (effectiveMimeType === '') {
        // Hide the "Choose other Application" text, in case the content is sniffed to an inlineable
        // type.
        $('openwith-other-app-info').hidden = true;
    }

    if (importReturnValue()) {
        return;
    }

    // Default behavior, when the user has not overridden the default action.

    if (dialogArguments.forceDownload) {
        setDefaultChoice('save');
    } else if (!isSniffingMimeType && !mimeType) {
        setDefaultChoice('openwith');
    }

    if (isSniffingMimeType) {
        $('mime-type').value = 'sniffed';
        return;
    }
    var suggestedMimeAction = getSuggestedMimeAction(effectiveMimeType);
    if (suggestedMimeAction) {
        $('mime-type').value = suggestedMimeAction;
        if ($('mime-type').selectedIndex === -1) {
            // TODO: Add more options? Implement "Open with <web app>?" Think about it!
            // For now, just fall back to the original option.
            $('mime-type').value = 'original';
        }
    }
}

/**
 * @param {string} typeString The description of the file type.
 * @param {number} bytes The number of bytes in the response, -1 if unknown.
 * @returns {string} A localized, formatted string that shows the given information.
 */
function formatTypeAndSize(typeString, bytes) {
    // Following the logic from
    // https://searchfox.org/mozilla-central/rev/a662f122c37704456457a526af90db4e3c0fd10e/toolkit/mozapps/downloads/nsHelperAppDlg.js#629-639
    if (bytes === -1) {
        return typeString;
    }
    // https://searchfox.org/mozilla-central/rev/a662f122c37704456457a526af90db4e3c0fd10e/toolkit/mozapps/downloads/DownloadUtils.jsm#447-478
    var unitIndex = 0;
    var units = ['bytes', 'kilobyte', 'megabyte', 'gigabyte'];
    while (bytes >= 999.5 && unitIndex < units.length - 1) {
        bytes /= 1024;
        unitIndex++;
    }
    var bytesString = 'Infinity';
    if (isFinite(bytes)) {
        var fractionDigits = bytes > 0 && bytes < 100 && unitIndex !== 0 ? 1 : 0;
        var locale = Intl.NumberFormat().resolvedOptions().locale + '-u-nu-latn';
        bytesString = Intl.NumberFormat(locale, {
            maximumFractionDigits: fractionDigits,
            minimumFractionDigits: fractionDigits,
        }).format(bytes);
    }
    var unitString = chrome.i18n.getMessage(units[unitIndex]);
    return chrome.i18n.getMessage('orderedFileSizeWithType', [typeString, bytesString, unitString]);
}

function getSuggestedMimeAction(/*string*/ mimeType) {
    // The mime-to-icon mapping is quite accurate, so re-use the information.
    var iconType = mime_getIcon(mimeType).replace('icons/', '').replace('.png', '');

    switch (iconType) {
    case 'text-html':
        if (mimeType.lastIndexOf('+xml') !== -1) {
            if (mimeType.lastIndexOf('image/svg', 0) === 0)
                return 'original';
            if (mimeType !== 'application/xhtml+xml')
                return 'text/xml';
        }
        return 'text/html';
    case 'text-x-generic':
    case 'text-x-generic-template':
    case 'text-x-script':
        return 'text/plain';
    case 'image-x-generic':
        return 'image/png';
    default:
        if (mimeType.startsWith('text/'))
            return 'text/plain';
        return 'original'; // Open as server-sent MIME = most likely download
    }
}

function renderURL(/*string*/ url) {
    var a = document.createElement('a');
    a.href = url;
    $('url-protocol').textContent = a.protocol + '//';
    if (a.protocol === 'https:') {
        $('url-protocol').classList.add('https');
    }
    $('url-host').textContent = a.host;
    $('url-remainder').textContent = a.pathname + a.search + a.hash;
}

function bindFormEvents() {
    var populateDatalist = function() {
        populateDatalist = null;
        var options = document.createDocumentFragment();
        for (var i = 0; i < mimeMetadata.allMimeTypes.length; ++i) {
            options.appendChild(new Option('', mimeMetadata.allMimeTypes[i]));
        }
        $('mime-custom-completion').appendChild(options);
    };
    $('mime-type').onchange = function() {
        document.querySelector('input[name="choice"][value="openas"]').checked = true;
        var isCustom = this.value === 'other';
        var mimeCustom = $('mime-custom');
        if (mimeCustom.hidden === isCustom) {
            mimeCustom.hidden = !isCustom;
            mimeCustom.required = isCustom;
            resizeDialog();
        }
        if (isCustom) {
            if (populateDatalist) populateDatalist();
            mimeCustom.focus();
        }
    };
    // Click on OK, press Enter, etc.
    document.forms.action.onsubmit = function(event) {
        event.preventDefault();
        exportReturnValue();
        closeDialog();
    };
    $('cancel').onclick = function(event) {
        event.preventDefault();
        event.stopPropagation();
        window.returnValue = undefined;
        closeDialog();
    };

    // Windows    : [Ok] [Cancel]
    // Linux/macOS: [Cancel] [Ok]
    if (!/Win/.test(navigator.platform)) {
        $('cancel').after($('confirm'));
    }
}

function bindPreferenceEvents() {
    $('options-link').onclick = function(e) {
        // Intercept every left/middle click, regardless of key modifiers.
        chrome.runtime.openOptionsPage();
        e.preventDefault();
    };
}

/**
 * Set return value of the dialog with the selected option
 */
function exportReturnValue() {
    var choice = document.querySelector('input[name="choice"]:checked').value;
    var rememberChoice = $('remember').checked;
    // NOTE: Keep format of returnValue in sync with the format of Prefs.getMimeAction
    // rememberChoice is only used by the background page, used to determine whether
    // the choice needs to be persisted through a preference.
    switch (choice) {
        case 'openas':
            var action;
            var mime = $('mime-type').value;
            if (mime === 'original') {
                action = MimeActions.OIB_SERVER_SENT;
                mime = dialogArguments.contentType;
            } else if (mime === 'sniffed') {
                action = MimeActions.OIB_SERVER_SNIFF;
                mime = dialogArguments.guessedMimeType;
            } else if (mime === 'other') {
                action = MimeActions.OIB_MIME;
                mime = $('mime-custom').value.trim();
            } else {
                action = MimeActions.OIB_GENERIC;
            }
            window.returnValue = {
                action: action,
                mime: mime,
                rememberChoice: rememberChoice
            };
        break;
        case 'openwith':
            window.returnValue = {
                action: MimeActions.OPENWITH,
                rememberChoice: rememberChoice
            };
        break;
        case 'save':
            window.returnValue = {
                action: MimeActions.DOWNLOAD,
                rememberChoice: rememberChoice
            };
        break;
    }
    console.log('Choice: ' + choice, window.returnValue);
}

function importReturnValue() {
    var returnValue = dialogArguments.desiredAction;
    if (!returnValue.action) {
        return false;
    }
    // Use saved value
    var choice;
    switch (returnValue.action) {
        case MimeActions.OIB_SERVER_SNIFF:
            choice = 'openas';
            // Use server-sent by default, unless the server-sent MIME type was determined to be
            // unreliable.
            $('mime-type').value = dialogArguments.isSniffingMimeType ? 'sniffed' : 'original';
        break;
        case MimeActions.OIB_SERVER_SENT:
            choice = 'openas';
            $('mime-type').value = 'original';
        break;
        case MimeActions.OIB_MIME:
            choice = 'openas';
            $('mime-type').value = 'other';
            $('mime-custom').value = returnValue.mime;
            $('mime-custom').hidden = false;
        break;
        case MimeActions.OIB_GENERIC:
            choice = 'openas';
            $('mime-type').value = returnValue.mime;
        break;
        case MimeActions.OPENWITH:
            choice = 'openwith';
        break;
        case MimeActions.DOWNLOAD:
            choice = 'save';
        break;
    }
    setDefaultChoice(choice);
    return true;
}
function setDefaultChoice(choice) {
    var checkbox = document.querySelector('input[name="choice"][value="' + choice + '"]');
    checkbox.checked = true;
    checkbox.focus();
}

function closeDialog() {
    chrome.runtime.sendMessage({
        action: 'setReturnValue',
        returnValue: window.returnValue,
    }, function() {
        // The background page closes us. But in case that does not happen,
        // close anyway.
        window.close();
    });
}
