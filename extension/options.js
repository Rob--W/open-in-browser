/* globals Prefs, MimeActions, EXTERNAL_VIEWERS */
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

        var mimeAction = Prefs.getMimeAction(originalMimeType);
        var actionMessage;
        var mimeType = mimeAction.mime;
        if (mimeType) {
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
        } else if (mimeAction.action === MimeActions.OPENWITH) {
            actionMessage = 'Open with ' + EXTERNAL_VIEWERS[mimeAction.openWith].name;
        } else if (mimeAction.action === MimeActions.DOWNLOAD) {
            actionMessage = 'Save file';
        }
        row.insertCell(1).textContent = actionMessage;

        row.insertCell(2).appendChild(button.cloneNode()).onclick = function() {
            row.classList.toggle('restored-to-default');
            var isRemoved = row.classList.contains('restored-to-default');
            if (isRemoved) {
                this.value = 'Undo reset';
                Prefs.removeMimeAction(originalMimeType);
            } else {
                this.value = 'Restore default';
                Prefs.setMimeAction(originalMimeType, mimeAction);
            }
        };
    });
    table.removeChild(table.tBodies[0]);
    table.appendChild(tbody);
    table.hidden = false;
}

function renderViewerPreferences(externalViewersPref) {
    var prefItems = document.createDocumentFragment();

    var labelBase = document.createElement('label');
    labelBase.className = 'pref';

    var checkboxBase = document.createElement('input');
    checkboxBase.type = 'checkbox';

    Object.keys(EXTERNAL_VIEWERS).forEach(function(identifier) {
        var viewer = EXTERNAL_VIEWERS[identifier];
        var pref = externalViewersPref[identifier];
        var isExtension = viewer.type === 'extension';
        // Extensions disabled by default, others (web) enabled by default
        var isEnabled = isExtension ? pref && pref.enabled : !pref || pref.enabled;
        var label = labelBase.cloneNode();
        var checkbox = checkboxBase.cloneNode();
        
        checkbox.checked = isEnabled;
        checkbox.onchange = function toggleViewer() {
            if (isExtension && false) { // TODO: Remove block, because management API is default
                // Extension. Need access to management API to check whether the extension
                // is installed!
                // TODO: Check availability of management API and return if unavailable
                // TODO: Request management API permission
                console.log('Extension. To-do: implement use of management API');
                this.checked = false;
                return;
            }
            if (!pref) pref = externalViewersPref[identifier] = {};
            pref.enabled = this.checked;
            Prefs.set('external-viewers', externalViewersPref);
        };

        var labelText = viewer.name;
        if (isExtension) {
            labelText += ' (extension)';
        }

        label.appendChild(checkbox);
        label.appendChild(document.createTextNode(labelText));
        prefItems.appendChild(label);
    });
    $('external-viewers').appendChild(prefItems);
}

bindBooleanPref('text-nosniff');

bindBooleanPref('octet-sniff-mime');

bindBooleanPref('contextmenu');

Prefs.setPrefHandler('mime-mappings', renderMimeMappings);

Prefs.setPrefHandler('external-viewers', renderViewerPreferences);

