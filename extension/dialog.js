/**
 * (c) 2013 Rob Wu <gwnRob@gmail.com>
 */
/* globals dialogArguments, console,
            mimeMetadata,
            mime_fromFilename,
            mime_getFriendlyName,
            mime_getIcon
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
handleDetails(dialogArguments.url, dialogArguments.filename, dialogArguments.mimeType);

function handleDetails(url, filename, mimeType) {
    document.title = 'Opening ' + filename;

    renderMetadata(filename, mimeType);

    renderURL(url);

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

function resizeDialog(/*boolean*/ moveDialog) {
    var WIDTH = 500;
    var innerHeight = window.innerHeight;
    if (innerHeight === 0) { // innerHeight = 0 shortly after page load.
        setTimeout(resizeDialog, 20, moveDialog);
        return;
    }
    var outerHeight = window.outerHeight;
    var verticalDialogPadding = outerHeight - innerHeight;
    if (verticalDialogPadding <= 0) { // Value of outerHeight is ****ing unreliable.
        verticalDialogPadding = 40;   // Chrome on Linux = 27, Chrome on OS X = 22.
        console.log('Detected a non-positive height of the window chrome. This is impossible. ' +
                    'Using verticalDialogPadding = ' + verticalDialogPadding + ' as fallback.');
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
    }
}

function renderMetadata(/*string*/ filename, /*string*/ mimeType) {
    $('filename').textContent = filename;
    $('filename').title = filename;

    var mimeTypeFromFilename = mime_fromFilename(filename);
    var iconUrl = mime_getIcon(mimeType);
    var friendlyMimeType = mime_getFriendlyName(mimeType);
    if (mimeType === 'application/octet-stream' || mimeType === 'text/plain') {
        // These types are subject to MIME-sniffing. And they're also commonly misused.
        iconUrl = mime_getIcon(mimeTypeFromFilename) || iconUrl;
        friendlyMimeType = mime_getFriendlyName(mimeTypeFromFilename) || friendlyMimeType;
    }

    $('content-type').textContent = friendlyMimeType || mimeType;
    $('content-type').title = 'Server-sent MIME: ' + mimeType + '\n' +
                              'Based on file extension: ' + mimeTypeFromFilename;

    if (iconUrl) {
        $('metadata-block').style.backgroundImage = 'url("' + iconUrl + '")';
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
    switch (choice) {
        case 'openas':
            var mime = $('mime-type').value;
            if (mime === 'original') {
                mime = dialogArguments.contentType;
            } else if (mime === 'other') {
                mime = $('mime-custom').value.trim();
            }
            window.returnValue = {
                mime: mime,
                rememberChoice: rememberChoice
            };
        break;
        case 'save':
            window.returnValue = {
                save: true,
                rememberChoice: rememberChoice
            };
        break;
    }
    if (window.opener && !window.opener.closed) window.opener.dialogResult = window.returnValue;
    console.log('Choice: ' + choice, window.returnValue);
}
