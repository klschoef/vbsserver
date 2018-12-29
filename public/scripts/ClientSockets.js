class ClientSockets {

    constructor(params, callback) {

        console.log("initializing WebSocket connection");

        this.socket = io.connect(config.server.websocketURL + ":" + config.server.port, {
            'reconnect': true,
            'reconnection delay': 50,
            'max reconnection attempts': 300, // TODO check if all these parameters are appropriate...
            'query': params
        });

        // authentication is required if not in debug mode and not logged in yet in the current session
        this.socket.on('authenticationRequired', () => {

            var div = document.createElement("div");    // TODO use some nicer template for this
            div.id = "loginDiv";
            // $(div).append("<h4>Authentication</h4>");
            $(div).append("<input type='text' id='userInput' /><br>");
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
                var user = $("#userInput").val();
                var password = $("#pwInput").val();
                this.socket.emit("authentication", {username: user, password: password});
            });
        });

        this.socket.on("authenticated", () => {
            console.log("authenticated");
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
                $("body").append("Connection error<br><a href='#' onclick='window.location.reload();'>Reload</a>");
                this.needsRefresh = true;
            }
        });

        this.socket.on('error', (err) => {
            console.log("socket connection error!! " + err);
            $("body").empty();
            $("body").append("Connection error<br><a href='#' onclick='window.location.reload();'>Reload</a>");
        });

    }

    logout() {
        console.log("logging out");
        this.emit("logout", {}, () => {});
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
