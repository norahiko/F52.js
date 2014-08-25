"use strict";
var http = require("http");
var fs = require("fs");
var url = require("url");
var ws = require("ws");


exports.port = 6636;

exports.host = "localhost";

exports.Reloader = Reloader;

function Reloader(callback) {
    var reloader = this;
    this.master = false;
    this.server = null;
    this.wss = null;
    this.port = Number(process.env.SIMPLE_RELOADER_PORT) || exports.port;
    this.host = process.env.SIMPLE_RELOADER_HOST || exports.host;
    this.root = "http://" + exports.host + ":" + this.port + "/";
    this.scriptURL = this.root + "reloader.js";
    this.scriptSource = null;
    callback = callback || function noop() {};


    var server = http.createServer(function(req, res) {
        reloader._requestHandler(req, res);
    });

    server.on("error", function (err) {
        console.log(err);
        callback(null);
    });

    server.listen(this.port, function() {
        reloader._initMasterReloader(server);
        callback(null);
    });
}


Reloader.prototype.close = function(callback) {
    this.master && this.server.close(callback);
};

Reloader.prototype.reload = function() {
    if(this.master && this.wss) {
        this.wss.clients.forEach(function(ws) {
            ws.send("reload_browser");
            ws.send(new Buffer("blobdata"));
        });
    }
};

Reloader.prototype._initMasterReloader = function(server) {
    this.master = true;
    this.server = server;
    var path = require.resolve("./script/reloader.js");
    var src = fs.readFileSync(path).toString();
    src = src.replace("<HOST>", this.host);
    src = src.replace("<PORT>", this.port);
    this.scriptSource = src;
    this.wss = new ws.Server({ server: server, path: "/connect" });
};

Reloader.prototype._requestHandler = function(req, res) {
    var pathname = url.parse(req.url).pathname;
    if(pathname === "/reloader.js") {
        res.writeHead(200, { "Content-Type": "application/javascript" });
        res.end(this.scriptSource);
    } else if(pathname === "/reload") {
        this.reload();
        res.writeHead(200);
        res.end("simple-reloader.js\nreload");
    } else {
        res.writeHead(404);
        res.end("simple-reloader.js\n404 NotFound");
    }
};
