"use strict";
var http = require("http");
var fs = require("fs");
var querystring = require("querystring");
var url = require("url");
var ws = require("ws");
var webserver = require("./webserver.js");


exports.port = Number(process.env.F52_PORT) || 6636;

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
    this.revision = 1;
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
    if(this.master === false) {
        http.get(this.root + "/reload").on("error", function() {
            console.error("(F52.js) Could not find master server. Please restart me.");
        });
    } else if(this.wss) {
        this.revision += 1;
        this.wss.clients.forEach(function(ws) {
            ws.send("reload_browser");
            ws.send(new Buffer("blobdata"));
        });
    }
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

    switch(pathname) {
        case "/reloader.js":
            res.writeHead(200, { "Content-Type": "application/javascript" });
            var src = this.clientSource;
            src = src.replace("<HOST>", this.host);
            src = src.replace("<PORT>", this.port);
            src = src.replace("<REVISION>", String(this.revision));
            res.end(src);
            return;

        case "/reload":
            res.writeHead(200, { "Access-Control-Allow-Origin": "*" });
            res.end("F52.js\nreload");
            this.reload();
            return;

        case "/polling":
            var query = querystring.parse(urlinfo.query);
            var rev = Number(query.revision);
            console.log(rev, this.revision);
            res.writeHead(200, {
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "no-cache",
            });
            res.end(rev < this.revision ? "reload_browser" : String(this.revision));
            return;

        default:
            res.writeHead(404);
            res.end("F52.js\n404 NotFound");
    }
};
