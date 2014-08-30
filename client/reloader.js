/**
 * f52
 * http://github.com/norahiko/f52
 *
 * copyright norahiko
 * MIT License
 */
"use strict";
(function() {
var port = "<PORT>";
var host = "<HOST>";
var version = "<VERSION>";
var ws = null;
var retryMax = 50;
var trying = 1;
var retryInterval = 3000;
var pollingInterval = 1500;
var webSocketURL = "ws://" + host + ":" + port + "/connect";
var pollingURL = "http://" + host + ":" + port + "/polling";

if(window.WebSocket) {
    tryConnect();
} else {
    startPolling();
}

function tryConnect() {
    if(retryMax < trying) { return; }
    console.log("f52", "Trying connect to", webSocketURL, trying + "/" + retryMax);
    ws = new WebSocket(webSocketURL);
    ws.onopen = onOpenWebSocket;
    ws.onclose = onCloseWebSocket;
    ws.onerror = onErrorWebSocket;
    ws.onmessage = onMessageWebSocket;
    trying += 1;
}


function onOpenWebSocket() {
    trying = 1;
    console.log("f52", "Connect to", webSocketURL);
}

function onErrorWebSocket(err) {
    // noop
}

function onCloseWebSocket() {
    ws = null;
    setTimeout(tryConnect, retryInterval);
}

function onMessageWebSocket(event) {
    var data = event.data;
    if(data === "reload_browser") {
        location.reload();
    }
}

function startPolling() {
    if(retryMax < trying) { return; }
    setTimeout(polling, pollingInterval);
}

function polling() {
    var url = pollingURL + "?version=" + version;
    var xhr = new XMLHttpRequest();
    xhr.open("GET", url, true);
    xhr.onload = onLoadPolling;
    xhr.onerror = onErrorPolling;
    xhr.send();
}

function onLoadPolling() {
    //jshint validthis: true
    var msg = this.responseText;
    if(msg === "reload_browser") {
        location.reload();
    } else {
        trying = 0;
        startPolling();
    }
}

function onErrorPolling() {
    trying += 1;
    startPolling();
}

})();
