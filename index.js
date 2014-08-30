"use strict";

exports.port = null;

exports.host = null;

exports.Reloader = require("./lib/reloader.js").Reloader;

exports.createWebServer = require("./lib/webserver.js").createWebServer;

var DEFAULT_HOST = "localhost";
var DEFAULT_PORT = 1552;

Object.defineProperties(exports, {
    _getHost: {
        value: function() {
            return exports.host || process.env.F52_HOST || DEFAULT_HOST;
        }
    },
    _getPort: {
        value: function() {
            return exports.port || Number(process.env.F52_PORT) || DEFAULT_PORT;
        }
    },
});
