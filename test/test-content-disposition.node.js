#!/usr/bin/env node
/* eslint-env node */
'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const vm = require('vm');

const sandbox = {
    console,
    TextDecoder: util.TextDecoder,
};
vm.createContext(sandbox);

function loadScript(filename) {
    filename = path.resolve(__dirname, filename);
    const code = fs.readFileSync(filename, {encoding: 'utf-8'});
    vm.runInContext(code, sandbox, {
        filename,
        displayErrors: true,
    });
}

loadScript('../extension/content-disposition.js');
loadScript('test-content-disposition.js');
