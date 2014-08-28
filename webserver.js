"use strict";

var http = require("http");
var fs = require("fs");
var net = require("net");
var pathModule = require("path");
var urlModule = require("url");


var f52 = require("./index.js");

exports.createWebServer = createWebServer;

function createWebServer(options) {
    var reloader = new f52.Reloader();
    options.reloaderClientURL = reloader.clientURL;

    var server = http.createServer(function(req, res) {
        var handler = new RequestHandler(req, res, options);
        handler.handle();
    });

    server.reloader = reloader;
    server.reload = function() {
        reloader.reload();
    };

    searchEmptyPort(options.port, 50, function(err, port) {
        if(err) {
            server.emit("error", err);
        } else {
            server.listen(port, options.host);
        }
    });

    server.close = function(callback) {
        server.reloader.close(function() {
            http.Server.prototype.close.call(server, callback);
        });
    };

    return server;
}

function RequestHandler(req, res, options) {
    var url = urlModule.parse(req.url).pathname;
    url = url.replace(/\/\.{1,2}(?=\/|$)/g, "");     // remove "/../" or "/./
    url = url.replace(/^\/+/, "/");

    this.url = url;
    this.requested = decodeURIComponent(url);
    this.reloaderClientURL = options.reloaderClientURL;
    this.filepath = pathModule.join(options.documentRoot, this.requested);
    this.res = res;
}


RequestHandler.prototype.handle = function() {
    if(fs.existsSync(this.filepath) === false) {
        this.notFound();
        return;
    }

    var stat = fs.statSync(this.filepath);
    var readable = 256; // 0400;

    if((stat.mode & readable) === 0) {
        this.forbidden();

    } else if(stat.isDirectory()) {
        this.serveDirectory();

    } else if(stat.isFile()) {
        this.serveFile();

    } else {
        this.notFound();
    }
};



RequestHandler.prototype.serveFile = function () {
    // jshint quotmark: false

    var scriptTag = '<script src="' + this.reloaderClientURL + '"></script>';
    var type = guessMimetype(this.filepath);

    this.res.writeHead(200, { "Content-Type": type });

    if(type === "text/html") {
        var html = fs.readFileSync(this.filepath).toString();
        if(html.indexOf("<head>") === -1) {
            html += scriptTag;
        } else {
            html = html.replace("<head>", "<head>\n	" + scriptTag + "\n");
        }
        this.res.end(html);
    } else {
        fs.createReadStream(this.filepath).pipe(this.res);
    }
};


RequestHandler.prototype.serveDirectory = function() {
    if(this.requested[this.requested.length - 1] !== "/") {
        this.url += "/";
        this.redirect();
        return;
    }

    var indexPage = pathModule.join(this.filepath, "index.html");
    if(fs.existsSync(indexPage)) {
        this.filepath = indexPage;
        this.serveFile();
    } else {
        this.serveListDirectory();
    }
};


RequestHandler.prototype.serveListDirectory = function () {
    // jshint quotmark: false
    var handler = this;

    var body = [];
    if(this.requested !== "/") {
        // add link to parent directory
        body.push('<li><a href="../">../</a></li>');
    }

    var files = fs.readdirSync(this.filepath);
    var dir = this.filepath;
    if(dir[dir.length - 1] !== "/") {
        dir += "/";
    }

    files.forEach(function(filename) {
        var p = dir + filename;
        var stat = fs.lstatSync(p);
        var url = handler.url + encodeURIComponent(filename);

        if(stat.isDirectory()) {
            url += "/";
            filename += "/";
        } else if(stat.isSymbolicLink()) {
            filename += "@";
        }
        body.push('<li><a href="', url, '">', filename, '</a></li>\n');
    });

    this.res.writeHead(200, {"Content-Type": "text/html", });
    this.res.write("<!DOCTYPE html><html><body>\n");
    this.res.write('<script src="' + this.reloaderClientURL + '"></script>\n');
    this.res.write("<h1>" + decodeURIComponent(this.requested) + "</h1>\n");
    this.res.write(body.join(""));
    this.res.end("\n</body></html>");
};


RequestHandler.prototype.redirect = function() {
    this.res.writeHead(301, { "Location": this.url });
    this.res.end("");
};


RequestHandler.prototype.forbidden = function() {
    this.res.writeHead(403, {"Content-Type": "text/html"});
    this.res.end("<h1>Forbidden</h1><dd>" + this.requested + "</dd>");
};


RequestHandler.prototype.notFound = function() {
    this.res.writeHead(404, {"Content-Type": "text/html"});
    this.res.end("<h1>File Not found</h1><dd>" + this.requested + "</dd>");
};


function searchEmptyPort(port, retry, callback) {
    var server = new net.Server();

    server.on("error", function(err) {
        if(retry < 1) {
            callback(err);
        } else {
            searchEmptyPort(port + 1, retry - 1, callback);
        }
    });
    server.listen(port, function() {
        server.close(function() {
            callback(null, port);
        });
    });
}

function guessMimetype(path) {
    var ext = pathModule.extname(path).toLowerCase();
    if(mimeTypes[ext]) {
        return mimeTypes[ext];
    }

    if(containsNullByte(path)) {
        return "application/octet-stream";
    }
    return "text/plain";
}


function containsNullByte(path) {
    var bufsize = 8192;
    var buffer = new Buffer(bufsize);
    var fd = fs.openSync(path, "r");
    var readBytes;

    while(true) {
        readBytes = fs.readSync(fd, buffer, 0, bufsize);
        if(readBytes === 0) {
            break;
        }
        for(var i = 0; i < readBytes; i++) {
            if(buffer[0] === 0) {
                fs.closeSync(fd);
                return true;
            }
        }
    }
    fs.closeSync(fd);
    return false;
}



// Copyright Python Software Foundation

var mimeTypes = {
    ".appcache" : "text/cache-manifest",
    ".avi"      : "video/x-msvideo",
    ".bash"     : "text/plain",
    ".bmp"      : "image/x-ms-bmp",
    ".css"      : "text/css",
    ".c"        : "text/plain",
    ".cc"       : "text/plain",
    ".coffee"   : "text/plain",
    ".cpp"      : "text/plain",
    ".cs"       : "text/plain",
    ".doc"      : "application/msword",
    ".dot"      : "application/msword",
    ".flv"      : "video/x-flv",
    ".gif"      : "image/gif",
    ".groovy"   : "text/plain",
    ".go"       : "text/plain",
    ".gz"       : "application/gzip",
    ".h"        : "text/plain",
    ".hs"       : "text/plain",
    ".htm"      : "text/html",
    ".html"     : "text/html",
    ".ico"      : "image/vnd.microsoft.icon",
    ".java"     : "text/plain",
    ".jpeg"     : "image/jpeg",
    ".jpg"      : "image/jpeg",
    ".js"       : "application/javascript",
    ".json"     : "application/json",
    ".less"     : "text/plain",
    ".m4a"      : "audio/acc",
    ".manifest" : "text/cache-manifest",
    ".md"       : "text/plain",
    ".midi"     : "audio/midi",
    ".ml"       : "text/plain",
    ".mp3"      : "audio/mpeg",
    ".mp4"      : "video/mp4",
    ".mpeg"     : "video/mpeg",
    ".mpg"      : "video/mpeg",
    ".ogg"      : "audio/ogg",
    ".pdf"      : "application/pdf",
    ".php"      : "text/plain",
    ".pl"       : "text/plain",
    ".py"       : "text/plain",
    ".png"      : "image/png",
    ".rb"       : "text/plain",
    ".rst"      : "text/plain",
    ".sass"     : "text/plain",
    ".scss"     : "text/plain",
    ".scala"    : "text/plain",
    ".sh"       : "text/plain",
    ".sql"      : "text/plain",
    ".styl"     : "text/plain",
    ".swf"      : "application/x-shockwave-flash",
    ".ts"       : "text/plain",
    ".txt"      : "text/plain",
    ".vim"      : "text/plain",
    ".wav"      : "audio/x-wav",
    ".webm"     : "video/webm",
    ".webp"     : "image/webp",
    ".xhtml"    : "application/xhtml+xml",
    ".xml"      : "text/xml",
    ".xsl"      : "application/xml",
    ".xls"      : "application/msexcel",
    ".yaml"     : "application/yaml",
    ".yml"      : "application/yaml",
    ".zip"      : "application/zip",
};
