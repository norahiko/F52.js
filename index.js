"use strict";
var http = require("http");
var fs = require("fs");
var querystring = require("querystring");
var url = require("url");
var ws = require("ws");


exports.port = Number(process.env.SIMPLE_RELOADER_PORT) || 6636;

exports.host = process.env.SIMPLE_RELOADER_HOST || "localhost";

exports.Reloader = Reloader;

function Reloader(callback) {
    var reloader = this;
    this.master = false;
    this.server = null;
    this.wss = null;
    this.revision = 1;
    this.port = exports.port;
    this.host = exports.host;
    this.root = "http://" + exports.host + ":" + exports.port;
    this.clientURL = exports.root + "/reloader.js";
    this.clientSource = null;

    var server = http.createServer(function(req, res) {
        reloader._requestHandler(req, res);
    });

    server.on("error", function (err) {
        console.log(err);
        callback && callback(null);
    });

    server.listen(this.port, function() {
        reloader._initMasterReloader(server);
        callback && callback(null);
    });
}


Reloader.prototype.close = function(callback) {
    this.master && this.server.close(callback);
};

Reloader.prototype.reload = function() {
    if(this.master === false) {
        http.get(this.root + "/reload").on("error", function() {
            console.error("(simple-reloader) Could not find master server. Please restart me.");
        });
    } else if(this.wss) {
        this.revision += 1;
        this.wss.clients.forEach(function(ws) {
            ws.send("reload_browser");
            ws.send(new Buffer("blobdata"));
        });
    }
};

Reloader.prototype._initMasterReloader = function(server) {
    this.master = true;
    this.server = server;
    var path = require.resolve("../script/reloader.js");
    this.clientSource = fs.readFileSync(path).toString();
    this.wss = new ws.Server({ server: server, path: "/connect" });
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
            res.end("simple-reloader.js\nreload");
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
            res.end("simple-reloader.js\n404 NotFound");
    }
};
