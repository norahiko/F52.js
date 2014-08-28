"use strict";
var http = require("http");
var fs = require("fs");
var querystring = require("querystring");
var url = require("url");
var ws = require("ws");
var webserver = require("./webserver.js");


exports.port = Number(process.env.F52_PORT) || 1552;

exports.host = process.env.F52_HOST || "localhost";

exports.Reloader = Reloader;

exports.createWebServer = webserver.createWebServer;

/**
 * Reloader
 */

function Reloader(callback) {
    var reloader = this;
    this.master = false;
    this.server = null;
    this.wss = null;
    this.version = "0";
    this.port = exports.port;
    this.host = exports.host;
    this.root = "http://" + exports.host + ":" + exports.port;
    this.clientURL = this.root + "/reloader.js";
    this.clientSource = null;

    this.server = http.createServer(function(req, res) {
        reloader._requestHandler(req, res);
    });

    this.server.on("error", function (err) {
        if(this.master) {
            console.error(err);
        } else {
            callback && callback(null);
            reloader.server = null;
        }
    });

    this.server.listen(this.port, function() {
        reloader._initMasterReloader();
        callback && callback(null);
        callback = null;
    });
}


Reloader.prototype.close = function(callback) {
    if(this.master) {
        this.server.close(callback);
    } else {
        setTimeout(callback, 0);
    }
};

Reloader.prototype.reload = function() {
    if(this.master) {
        this._reloadBloadcast();
    } else {
        http.get(this.root + "/reload").on("error", function() {
            console.error("(f52) Could not find master server. Please restart me.");
        });
    }
};

Reloader.prototype._reloadBloadcast = function () {
    if(this.wss === undefined) { return; }

    this.version = String(Math.random());
    this.wss.clients.forEach(function(ws) {
        ws.send("reload_browser");
        ws.send(new Buffer("blobdata"));
    });
};


Reloader.prototype._initMasterReloader = function() {
    this.master = true;
    var path = require.resolve("./client/reloader.js");
    this.clientSource = fs.readFileSync(path).toString();
    this.wss = new ws.Server({ server: this.server, path: "/connect" });
};

Reloader.prototype._requestHandler = function(req, res) {
    var urlinfo = url.parse(req.url);
    var pathname = urlinfo.pathname;
    var query = urlinfo.query;

    switch(pathname) {
        case "/reloader.js":
            this._serveClientScript(res);
            return;

        case "/reload":
            res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
            res.end("f52\nreload");
            this._reloadBloadcast();
            return;

        case "/polling":
            this._pollingHandler(query, res);
            return;

        default:
            res.writeHead(404);
            res.end("f52\n404 NotFound");
    }
};


Reloader.prototype._serveClientScript = function(res) {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    var src = this.clientSource;
    src = src.replace("<HOST>", this.host);
    src = src.replace("<PORT>", this.port);
    src = src.replace("<VERSION>", String(this.version));
    res.end(src);
};

Reloader.prototype._pollingHandler = function(query, res) {
    var version = querystring.parse(query).version;

    if(version === undefined) {
        res.writeHead(400, {
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "no-cache",
        });
        res.end("f52\nmissing version parame");
        return;
    }

    res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
    });
    res.end(version === this.version ? "nop" : "reload_browser");
};
