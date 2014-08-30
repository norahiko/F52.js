"use strict";

var http = require("http");
var fs = require("fs");
var net = require("net");
var pathModule = require("path");
var urlModule = require("url");
var f52 = require("../index.js");

exports.createWebServer = createWebServer;

function createWebServer(options) {
    options = Object.create(options || null);
    options.port = options.port || 8000;
    options.documentRoot = options.documentRoot || "./";

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

    searchEmptyPort(options.port || 8000, 50, function(err, port) {
        if(err) {
            server.emit("error", err);
        } else {
            options.port = port;
            server.listen(port, f52._getHost());
            server.on("error", function(err) {
                console.log(f52._getHost(), err);
                process.exit(1);
            });
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
    this.originalPath = urlModule.parse(req.url).pathname;
    this.path = this.originalPath.replace(/\/\.{1,2}(?=\/|$)/g, "");     // remove "/../" or "/./
    this.path = this.path.replace(/\/+/g, "/");

    this.decodePath = decodeURIComponent(this.path);
    this.reloaderClientURL = options.reloaderClientURL;
    this.filepath = pathModule.join(options.documentRoot, this.decodePath);
    this.res = res;
}

RequestHandler.prototype.handle = function() {
    if(this.originalPath !== this.path) {
        this.redirect(this.path);
        return;
    }

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
    if(this.decodePath[this.decodePath.length - 1] !== "/") {
        this.redirect(this.path + "/");
        return;
    }

    var indexPage = pathModule.join(this.filepath, "index.html");
    if(fs.existsSync(indexPage)) {
        this.filepath = indexPage;
        this.serveFile();
    } else {
        this.renderListDirectory();
    }
};

RequestHandler.prototype.renderListDirectory = function () {
    // jshint quotmark: false
    var res = this.res;
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf8', });
    res.write('<!DOCTYPE html><html><body>\n');

    res.write('<style>\n');
    var styleSheet = fs.readFileSync(require.resolve("../client/listdir.css"));
    res.write(styleSheet);
    res.write('</style>\n');
    res.write('<link href="//maxcdn.bootstrapcdn.com/font-awesome/4.2.0/css/font-awesome.min.css" rel="stylesheet">');
    this.renderBreadcrumb();

    var list = this.listdir();
    res.write('<div class="listdir">\n');
    list.dirs.forEach(function(dir) {
        res.write('    <li><a href="' + dir.url + '"><i class="fa fa-folder"></i> ' + dir.filename + "</a></li>\n");

    });
    list.files.forEach(function(file) {
        var ext = pathModule.extname(file.filename);
        var mimetype = mimeTypes[ext];

        var icon = "fa-file-o";
        if(mimetype === "text/html") {
            icon = "fa-file-code-o";
        } else if(/^text/.test(mimetype)) {
            icon = "fa-file-text-o";
        } else if(mimetype === "application/pdf") {
            icon = "fa-file-pdf-o";
        } else if(mimetype === "application/msexcel") {
            icon = "fa-file-excel-o";
        } else if(mimetype === "application/zip" || mimetype === "application/gzip") {
            icon = "fa-file-archive-o";
        } else if(/^image/.test(mimetype)) {
            icon = "fa-file-image-o";
        } else if(/^audio/.test(mimetype)) {
            icon = "fa-file-audio-o";
        } else if(/^video/.test(mimetype)) {
            icon = "fa-file-video-o";
        }

        res.write('    <li><a href="' + file.url + '"><i class="fa ' + icon + '"></i> ' + file.filename + "</a></li>\n");
    });
    res.write('</div>\n\n');

    res.write('<script src="' + this.reloaderClientURL + '"></script>\n\n');
    res.end('\n</body></html>');
};




RequestHandler.prototype.renderBreadcrumb = function() {
    // jshint quotmark: false
    var res = this.res;

    var crumbs = this.path.slice(0, -1).split("/");
    var html = [];
    crumbs.forEach(function(name, i) {
        if(i === 0) {
            name = "root";
        }
        var url = crumbs.slice(0, i + 1).join("/");
        html.push('<a href="' + url + '/" class="item">' + decodeURIComponent(name) + '</a>');
    });

    res.write('<div class="breadcrumb">');
    res.write(html.join("/"));
    res.write('</div>\n');
    //this.res.write('<h1 class="breadcrumb">' + decodeURIComponent(this.decodePath) + '</h1>\n\n');
};

RequestHandler.prototype.listdir = function() {
    // jshint quotmark: false

    var path = this.filepath;
    var handler = this;
    if(path[path.length - 1] !== "/") {
        path += "/";
    }
    var files = [];
    var dirs = [];
    var links = [];

    fs.readdirSync(this.filepath).forEach(function(filename) {
        var p = path + filename;
        var url = handler.path + encodeURIComponent(filename);
        var stat = fs.lstatSync(p);

        if(stat.isDirectory()) {
            dirs.push({
                url: url + "/",
                filename: filename + "/",
            });

        } else if(stat.isSymbolicLink()) {
            var ref = fs.readlinkSync(p);
            links.push({
                url: url,
                filename: filename + " -> " + ref,
                ref: ref,
            });

        } else if(stat.isFile()) {
            files.push({
                url: url,
                filename: filename
            });
        }
    });

    return {
        files: files,
        dirs: dirs,
        links: links,
    };
};



RequestHandler.prototype.redirect = function(url) {
    this.res.writeHead(301, { "Location": url });
    this.res.end("");
};

RequestHandler.prototype.forbidden = function() {
    this.res.writeHead(403, {"Content-Type": "text/html"});
    this.res.end("<h1>Forbidden</h1><dd>" + this.decodePath + "</dd>");
};

RequestHandler.prototype.notFound = function() {
    this.res.writeHead(404, {"Content-Type": "text/html"});
    this.res.end("<h1>File Not found</h1><dd>" + this.decodePath + "</dd>");
};


/**
 * internal
 */

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
    ".hh"       : "text/plain",
    ".hpp"      : "text/plain",
    ".hs"       : "text/plain",
    ".htm"      : "text/html",
    ".html"     : "text/html",
    ".ico"      : "image/vnd.microsoft.icon",
    ".java"     : "text/plain",
    ".jpeg"     : "image/jpeg",
    ".jpg"      : "image/jpeg",
    ".js"       : "text/javascript",
    ".json"     : "text/json",
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
    ".xhtml"    : "text/xhtml+xml",
    ".xml"      : "text/xml",
    ".xsl"      : "application/xml",
    ".xls"      : "application/msexcel",
    ".yaml"     : "text/yaml",
    ".yml"      : "text/yaml",
    ".zip"      : "application/zip",
};
