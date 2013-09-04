/**
 * (c) 2013 Rob Wu <gwnRob@gmail.com>
 */
/* globals dialogArguments, console */
'use strict';
var $ = document.getElementById.bind(document);

if (!window.dialogArguments) {
    // Testing purposes only
    window.dialogArguments = {
        url: 'https://example.com/path/to/long/paaaaaaaaaaaaaaaath%20soace%20foo%20file.zip',
        filename: 'just a test.zip',
        contentType: 'application/octet-stream'
    };
}
handleDetails(dialogArguments.url, dialogArguments.filename, dialogArguments.contentType);

function handleDetails(url, filename, contentType) {
    document.title = 'Opening ' + filename;
    $('filename').textContent = filename;
    $('filename').title = filename;

    var mimeType = contentType.split(';', 1)[0].trim();
    $('server-sent-mime').textContent = mimeType;
    $('server-sent-mime').title = mimeType;

    renderURL(url);

    bindFormEvents();

    resizeDialog();
}
function resizeDialog() {
    // TODO: What about the window's size when the interface is localized?
    var WIDTH = 500;
    var HEIGHT = 330;
    window.resizeTo(WIDTH, HEIGHT);
    window.moveTo(
        Math.floor((screen.availWidth - WIDTH) / 2),
        Math.floor((screen.availHeight - HEIGHT) / 2)
    );
}


function renderURL(/*string*/ url) {
    var a = document.createElement('a');
    a.href = url;
    $('url').title = url;
    $('url-protocol').textContent = a.protocol + '//';
    if (a.protocol === 'https:') {
        $('url-protocol').classList.add('https');
    }
    $('url-host').textContent = a.host;
    $('url-remainder').textContent = a.pathname + a.search + a.hash;
}

function bindFormEvents() {
    $('mime-type').onchange = function() {
        var isCustom = this.value === 'other';
        var mimeCustom = $('mime-custom');
        mimeCustom.hidden = !isCustom;
        mimeCustom.required = isCustom;
        if (isCustom) {
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
    console.log('Choice: ' + choice, window.returnValue);
}
