/**
 * (c) 2013 Rob Wu <rob@robwu.nl> (https://robwu.nl)
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals Prefs, MimeActions */
'use strict';
Prefs.init();
var $ = document.getElementById.bind(document);

function bindBooleanPref(prefName) {
    var checkbox = $('pref-' + prefName);
    checkbox.onchange = function() {
        Prefs.set(prefName, this.checked);
    };
    Prefs.setPrefHandler(prefName, function(isEnabled) {
        checkbox.checked = isEnabled;
    });
}

function renderMimeMappings(mimeMappings) {
    var table = $('mime-mappings');
    renderMimeMappingsCommon(mimeMappings, table, false);
}

function renderSniffedMimeMappings(mimeMappings) {
    var table = $('sniffed-mime-mappings');
    renderMimeMappingsCommon(mimeMappings, table, true);
}

function renderMimeMappingsCommon(mimeMappings, table, isSniffingMimeType) {
    var mimeKeys = Object.keys(mimeMappings);
    if (mimeKeys.length === 0) {
        table.hidden = true;
        return;
    }

    var tbody = document.createElement('tbody');
    var button =  document.createElement('input');
    button.type = 'button';
    button.title = 'Click to restore the default handler for this type. Click again to undo.';
    button.value = 'Restore default';

    mimeKeys.sort().forEach(function(originalMimeType) {
        var row = tbody.insertRow(-1);
        row.insertCell(0).textContent = originalMimeType;

        var mimeAction;
        if (isSniffingMimeType) {
            // Since this is just the options page, we don't know the actual server-sent MIME type.
            // It is most likely "application/octet-stream", but let's just use "server-sent MIME".
            // The exact value does not matter, because all keys in mimeKeys exist in mimeMappings,
            // so getMimeAction will return that key.
            mimeAction = Prefs.getMimeAction(originalMimeType, true, 'server-sent MIME type');
        } else {
            mimeAction = Prefs.getMimeAction(originalMimeType, false, originalMimeType);
        }
        var actionMessage;
        if (mimeAction.action === MimeActions.OIB_MIME ||
            mimeAction.action === MimeActions.OIB_GENERIC) {
            var mimeType = mimeAction.mime;
            if (mimeAction.action === MimeActions.OIB_GENERIC) {
                mimeType = mimeType === 'text/plain' ? 'Text' :
                           mimeType === 'text/html' ? 'Web page' :
                           mimeType === 'text/xml' ? 'XML document' :
                           mimeType === 'image/png' ? 'Image' :
                           mimeType;
            }
            actionMessage = 'Open in browser as ' + mimeType;
        } else if (mimeAction.action === MimeActions.OIB_SERVER_SENT) {
            actionMessage = 'Open in browser with server-sent MIME';
        } else if (mimeAction.action === MimeActions.OIB_SERVER_SNIFF) {
            actionMessage = 'Open in browser with MIME from file extension';
        } else if (mimeAction.action === MimeActions.OPENWITH) {
            // TODO: i18n.
            actionMessage = 'Open with browser (Choose other Application)';
        } else if (mimeAction.action === MimeActions.DOWNLOAD) {
            actionMessage = 'Save file';
        }
        row.insertCell(1).textContent = actionMessage;

        row.insertCell(2).appendChild(button.cloneNode()).onclick = function() {
            row.classList.toggle('restored-to-default');
            var isRemoved = row.classList.contains('restored-to-default');
            if (isRemoved) {
                this.value = 'Undo reset';
                Prefs.removeMimeAction(originalMimeType, isSniffingMimeType);
            } else {
                this.value = 'Restore default';
                Prefs.setMimeAction(originalMimeType, isSniffingMimeType, mimeAction);
            }
        };
    });
    table.removeChild(table.tBodies[0]);
    table.appendChild(tbody);
    table.hidden = false;
}

bindBooleanPref('text-nosniff');

bindBooleanPref('octet-sniff-mime');

bindBooleanPref('override-download-type');

Prefs.setPrefHandler('mime-mappings', renderMimeMappings);

Prefs.setPrefHandler('sniffed-mime-mappings', renderSniffedMimeMappings);

