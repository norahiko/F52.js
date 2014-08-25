/**
 * Simple Reloader
 * MIT License
 * http://github.com/norahiko/simple-reloader
 */
"use strict";

var _simpleReloaderClient;

(function() {

var client = {
    port: "<PORT>", // replaced by server
    host: "<HOST>", // replaced by server
    ws: null,
    retryMax: 50,
    trying: 1,
    retryInterval: 3000,
    lastError: null,
};

client.url = "ws://" + client.host + ":" + client.port + "/connect";
client.tryConnect = tryConnect;
_simpleReloaderClient = client;

tryConnect();

function tryConnect() {
    if(client.retryMax < client.trying) { return; }
    console.log("simple-reloader", "Trying connect to", client.url, client.trying + "/" + client.retryMax);
    client.ws = new WebSocket(client.url);
    client.ws.onopen = onOpen;
    client.ws.onclose = onClose;
    client.ws.onerror = onError;
    client.ws.onmessage = onMessage;
    client.trying += 1;
}


function onOpen() {
    client.trying = 1;
    console.log("simple-reloader", "Connect to", client.url);
}

function onError(err) {
    client.lastError = err;
}

function onClose() {
    client.ws = null;
    setTimeout(tryConnect, client.retryInterval);
}

function onMessage(event) {
    var data = event.data;
    if(data === "reload_browser") {
        location.reload();
    }
}

})();
