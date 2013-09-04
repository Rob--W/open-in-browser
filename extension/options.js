'use strict';
var $ = document.getElementById.bind(document);

function bindBooleanPref(prefName) {
    var checkbox = $('pref-' + prefName);
    checkbox.checked = localStorage.getItem(prefName) === 'true';
    checkbox.onchange = function() {
        localStorage.setItem(prefName, this.checked ? 'true' : 'false');
    };
    window.addEventListener('storage', function(event) {
        if (event.key === prefName) checkbox.checked = event.newValue === 'true';
    });
}

function renderMimeMappings() {
    var table = $('mime-mappings');
    var mimeMappings = localStorage.getItem('mime-mappings');
    if (!mimeMappings || mimeMappings === '{}') {
        table.hidden = true;
        return;
    }
    mimeMappings = JSON.parse(mimeMappings);

    var tbody = document.createElement('tbody');
    var button =  document.createElement('input');
    button.type = 'button';
    button.title = 'Click to restore the default handler for this type. Click again to undo.';
    button.value = 'Restore default';

    Object.keys(mimeMappings).sort().forEach(function(originalMimeType) {
        var row = tbody.insertRow(-1);
        row.insertCell(0).textContent = originalMimeType;

        var action = mimeMappings[originalMimeType];
        var actionMessage;
        if (action === 'save') {
            actionMessage = 'Save file';
        } else {
            actionMessage = 'Open in browser as ' + action;
        }
        row.insertCell(1).textContent = actionMessage;

        row.insertCell(2).appendChild(button.cloneNode()).onclick = function() {
            row.classList.toggle('restored-to-default');
            var isRemoved = row.classList.contains('restored-to-default');
            if (isRemoved) {
                this.value = 'Undo reset';
                mimeMappings[originalMimeType] = undefined;
            } else {
                this.value = 'Restore default';
                mimeMappings[originalMimeType] = action;
            }
            localStorage.setItem('mime-mappings', JSON.stringify(mimeMappings));
        };
    });
    table.removeChild(table.tBodies[0]);
    table.appendChild(tbody);
    table.hidden = false;
}

bindBooleanPref('text-nosniff');

renderMimeMappings();
window.addEventListener('storage', function(event) {
    if (event.key === 'mime-mappings') renderMimeMappings();
});
