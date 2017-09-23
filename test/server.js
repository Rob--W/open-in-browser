#!/usr/bin/env node
/* eslint-env node */
'use strict';

var PORT = process.env.PORT || 8080;
var HOST = process.env.HOST || '127.0.0.1';

var fs = require('fs');
var path = require('path');
var publicDir = path.join(__dirname, 'public');

function escapeHTML(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function echoDir(dirpath, res) {
    fs.readdir(dirpath, function(err, files) {
        if (err) {
            console.error(`Cannot open directory: ${err}`);
            res.writeHead(500);
            res.end();
            return;
        }
        files = files.filter(filename => !filename.startsWith('.'));
        
        let body = files.map(function(filename) {
            return `<a href="${encodeURI(filename)}">${escapeHTML(filename)}</a>`;
        }).join('<br>\n');
        res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf8',
        });
        res.end(body);
    });
}

function echoFile(filepath, res) {
    fs.readFile(filepath, {
        encoding: 'utf8'
    }, function(err, data) {
        if (err) {
            console.error(`Cannot open file: ${err}`);
            res.writeHead(500);
            res.end();
            return;
        }
        // Very simple HTTP parser
        let firstLine = /^HTTP\/(\d+\.\d+) (\d+)(?: (.*))?(\r?\n)/.exec(data);
        if (!firstLine) {
            console.error('First line is not a HTTP status line.');
            res.writeHead(500);
            res.end();
            return;
        }
        // Allow \r\n or \n for newline, as long as it is consistent.
        let [fullLine, httpVersion, statusCode, statusText, newline] = firstLine;
        res.httpVersion = httpVersion;

        // Headers + response body
        data = data.slice(fullLine.length);
        let headersEnd = data.indexOf(newline + newline);
        headersEnd = headersEnd === -1 ? data.length : headersEnd;
        let headers = data.slice(0, headersEnd);
        for (let header of headers.split(newline)) {
            let sepI = header.indexOf(': ');
            if (sepI === -1) {
                console.warn('No separator found in header: ' + header);
                continue;
            }
            let headerName = header.slice(0, sepI);
            let headerValue = header.slice(sepI + 2);
            // Assuming that each header name occurs only once.
            // (otherwise last one wins).
            res.setHeader(headerName, headerValue);
        }

        res.writeHead(statusCode, statusText);

        // Response body
        data = data.slice(headersEnd + newline.length * 2);
        res.end(data);
    });
}

require('http').createServer(function(req, res) {
    console.log(req.method + ' ' + req.url);

    let filepath = path.normalize(req.url.split(/[?#]/, 1)[0]);
    filepath = path.normalize(path.join(publicDir, filepath));
    if (!filepath.startsWith(publicDir + '/')) {
        res.writeHead(400);
        return;
    }
    if (filepath === publicDir || filepath === publicDir + '/') {
        echoDir(publicDir, res);
        return;
    }
    echoFile(filepath, res);
}).listen(PORT, HOST, function() {
    console.log('Listening on http://' + HOST + ':' + PORT);
});
