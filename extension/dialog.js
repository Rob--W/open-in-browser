/**
 * (c) 2013 Rob Wu <gwnRob@gmail.com>
 */
/* globals dialogArguments, console,
            mimeMetadata,
            mime_getFriendlyName,
            mime_getIcon,
            MimeActions
 */
'use strict';
var $ = document.getElementById.bind(document);

if (!window.dialogArguments) {
    // After refreshing the page, dialogArguments gets lost.
    // Refreshing is disabled by disabling the context menu, Ctrl + F5 and Ctrl + R,
    // but one can still press F12 to open the developer tools and refresh the page
    // from that place.
    window.dialogArguments = JSON.parse(decodeURIComponent(window.location.hash.slice(1)));
}
handleDetails(dialogArguments.url, dialogArguments.filename, dialogArguments.guessedMimeType,
        dialogArguments.mimeType, dialogArguments.openWithOptions);

function handleDetails(url, filename, guessedMimeType, mimeType, openWithOptions) {
    document.title = chrome.i18n.getMessage('opening_title', filename);

    renderMetadata(filename, guessedMimeType, mimeType);

    renderURL(url);

    renderOpenWithOptions(openWithOptions);

    bindFormEvents();

    bindDialogEvents();

    resizeDialog(/*moveDialog=*/ true);
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
            window.close();
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

    window.resizeTo(WIDTH, HEIGHT);

    if (moveDialog === true) {
        window.moveTo(
            Math.floor((screen.availWidth - WIDTH) / 2),
            Math.floor((screen.availHeight - HEIGHT) / 2)
        );
        setTimeout(resizeDialog, 0, false);
    }
}

function renderMetadata(/*string*/ filename, /*string*/ guessedMimeType, /*string*/ mimeType) {
    $('filename').textContent = filename;
    $('filename').title = filename;

    $('content-type').textContent = mime_getFriendlyName(guessedMimeType) || guessedMimeType;

    var mimeTooltip = 'Server-sent MIME: ' + mimeType;
    if (guessedMimeType !== mimeType) {
        mimeTooltip += '\nBased on file extension: ' + guessedMimeType;
    }
    $('content-type').title = mimeTooltip;

    var iconUrl = mime_getIcon(guessedMimeType) || mime_getIcon(mimeType);
    if (iconUrl) {
        $('metadata-block').style.backgroundImage = 'url("' + iconUrl + '")';
    }

    if (importReturnValue()) {
        return;
    }
    var suggestedMimeAction = getSuggestedMimeAction(guessedMimeType);
    if (suggestedMimeAction) {
        $('mime-type').value = suggestedMimeAction;
        if ($('mime-type').selectedIndex === -1) {
            // TODO: Add more options? Implement "Open with <web app>?" Think about it!
            // For now, just fall back to the original option.
            $('mime-type').value = 'original';
        }
    }
    
}

function getSuggestedMimeAction(/*string*/ mimeType) {
    // The mime-to-icon mapping is quite accurate, so re-use the information.
    var iconType = mimeMetadata.mimeToIcon[mimeType] || (mimeType.split('/', 1)[0] + '-x-generic');

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
        if (mimeType.lastIndexOf('+xml') !== -1)
            return 'text/xml';
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

function renderOpenWithOptions(openWithOptions) {
    var openWithOptionsLength = openWithOptions.length;
    if (openWithOptionsLength === 0) {
        $('open-with-container').hidden = true;
        return;
    }
    var options = document.createDocumentFragment();
    for (var i = 0; i < openWithOptionsLength; ++i) {
        options.appendChild(new Option(openWithOptions[i].label, openWithOptions[i].identifier));
    }
    var openWithDropdown = $('open-with');
    openWithDropdown.appendChild(options);

    if (openWithOptionsLength === 1) {
        // Just one option. Hide the dropdown and show the viewer's name instead.
        openWithDropdown.selectedIndex = 0;
        openWithDropdown.hidden = true;
        var span = document.createElement('span');
        span.textContent = openWithOptions[0].label;
        openWithDropdown.parentNode.insertBefore(span, openWithDropdown);
    }
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
        window.close();
    };
    $('cancel').onclick = function(event) {
        event.preventDefault();
        event.stopPropagation();
        window.returnValue = undefined;
        window.close();
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
                openWith: $('open-with').value,
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
    if (window.opener && !window.opener.closed) window.opener.dialogResult = window.returnValue;
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
            $('open-with').value = returnValue.openWith;
            if ($('open-with').selectedIndex === -1) {
                console.warn('Unknown app "' + returnValue.openWith + '". Was it removed?');
                return false;
            }
        break;
        case MimeActions.DOWNLOAD:
            choice = 'save';
        break;
    }
    var checkbox = document.querySelector('input[name="choice"][value="' + choice + '"]');
    checkbox.checked = true;
    checkbox.focus();
    return true;
}
