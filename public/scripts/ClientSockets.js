class ClientSockets {

    constructor(params, callback) {

        console.log("initializing WebSocket connection");

        if (config.debugMode) {
            // no authentication in debug mode
            this.init("", params, callback);
        } else {
            // very rudimental authentication... TODO: improve!
            // TODO replace this quick hack by a proper implementation...
            var div = document.createElement("div");
            div.id = "loginDiv";
            $(div).append("<h4>Password</h4>");
            $(div).append("<input type='password' id='pwInput' />");
            $(div).append("<br><button id='loginBtn'>Login</button>");
            $(div).css("background-color", "black");
            $(div).css("position", "absolute");
            $(div).css("z-index", 99999);
            $(div).css("width", "100%");
            $(div).css("height", "100%");
            $(div).css("text-align", "center");
            $("body").append(div);

            $("#loginBtn").on("click", () => {
                $("#loginDiv").fadeOut();
                var password = $("#pwInput").val();
                this.init(password, params, callback);
            });
        }
    }

    init(password, params, callback) {
        this.socket = io.connect(config.server.websocketURL + ":" + config.server.port, {
            'reconnect': true,
            'reconnection delay': 50,
            'max reconnection attempts': 300, // TODO check if all these parameters are appropriate...
            'query': params
        });

        // default behaviour that can optionally be extended by further event handlers
        this.socket.on('connect', () => {
            this.socket.emit("authentication", {username: "User", password: password});
        });

        this.socket.on("authenticated", () => {
            if (this.needsRefresh) {
                // connection was lost before, so we have to refresh entire page
                // but before, disconnect (otherwise admin socket might not get freed on server)
                this.socket.disconnect();
            } else {
                console.log("socket connected!");
                callback();
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