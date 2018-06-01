class ClientSockets {

    constructor(params) {

        console.log("initializing WebSocket connection");
        this.socket = io.connect(config.server.websocketURL + ":" + config.server.port, {
            'reconnect': true,
            'reconnection delay': 50,
            'max reconnection attempts': 300, // TODO check if all these parameters are appropriate...
            'query': params
        });

        // default behaviour that can optionally be extended by further event handlers
        this.socket.on('connect', () => {
            if (this.needsRefresh) {
                // connection was lost before, so we have to refresh entire page
                // but before, disconnect (otherwise admin socket might not get freed on server)
                this.socket.disconnect();
            } else {
                console.log("socket connected!");
            }
        });

        this.socket.on('disconnect', () => {
            if (this.needsRefresh) {
                location.reload();
            } else {
                console.log("socket disconnected!");
                $("body").empty();
                $("body").append("Connection error");
                this.needsRefresh = true;
            }
        });

        this.socket.on('error', (err) => {
            console.log("socket connection error!! " + err);
            $("body").empty();
            $("body").append("Connection error");
        });

    }

    unload() {
        this.socket.disconnect();
    }

    authenticate() {
        // TODO...
    }

    registerEvent(event, callback) {
        this.socket.on(event, callback);
    }

    emit(event, data, callback) {
        this.socket.emit(event, data, callback);
    }

    disconnect() {
        this.socket.disconnect();
    }

}