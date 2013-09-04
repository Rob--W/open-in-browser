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

bindBooleanPref('text-nosniff');
