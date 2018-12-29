var logger = require('winston'),
        controller = require('../Controller'),
        config = require('../../config.json'),
        AdminSocket = require('./AdminSocket'),
        ViewerSocket = require('./ViewerSocket'),
        InspectSocket = require('./InspectSocket'),
        ExportSocket = require('./ExportSocket');

class SocketHandler {
    constructor(io) {

        this.io = io;

        this.admin = null;          // web socket for Admin user (we only allow one admin connection at a time to avoid inconsistencies!)
        this.viewers = new Array(); // web sockets for Viewer users (multiple connections allowed, but login required)
        this.judges = new Array();  // web sockets for registered judges

        io.on('connection', (socket) => {

            var authOK = false;
            if (config.debugMode) {
                // no authentication in debug mode
                authOK = true;
            } else if (socket.request && socket.request.session && socket.request.session.clientType) {
                // the user is already logged in, but we have to check his permissions
                var reqClientType = socket.handshake.query.clientType;  // requested permissions
                var clientType = socket.request.session.clientType;
                if (clientType.toLowerCase() == "admin" || clientType.toLowerCase() == reqClientType.toLowerCase()) { // TODO more sophisticated role concept
                    authOK = true;
                }
            }

            if (authOK) {
                this.authenticated(socket);
            } else {
                socket.emit("authenticationRequired");
            }

            socket.on('authentication', (data) => {

                //get credentials sent by the client
                var username = data.username;
                var password = data.password;
                var clientType = socket.handshake.query.clientType;

                controller.db.hasPermissions(username, password, clientType, () => {
                    socket.request.session.username = username;
                    socket.request.session.clientType = clientType;
                    socket.request.session.save();
                    this.authenticated(socket);
                }, () => {
                    logger.warn("login failed!!", JSON.stringify(socket.handshake));
                    socket.disconnect();
                }, () => {
                    logger.warn("login failed!!", JSON.stringify(socket.handshake));
                    socket.disconnect();
                });
            });

            socket.on('logout', (data) => {                
                delete socket.request.session.username;
                delete socket.request.session.clientType;
                socket.request.session.save();
                socket.disconnect();
            });

        });

    }

    authenticated(socket) {
        var clientType = socket.handshake.query.clientType;

        // unified format for web socket callbacks
        // success: boolean indicating whether the request was successfully fulfilled
        // data: requested data (if requested), error message in case of error
        socket.respond = (callback, success, data) => {
            callback({success: success, data: data});
        };

        /*
         * The admin user can maintain the list of teams and tasks, start/stop tasks and select already performed tasks to be displayed (at Viewer)
         * Viewer users see the current query, timer, submissions and chart. The "current" query can either be a running one or an already finished one.
         * All types of users need to login (via websocket).
         */

        switch (clientType) {
            case "admin":       // has access to: edit,control,viewer,inspect
                this.registerAdmin(socket);
                this.registerViewer(socket);
                break;
            case "viewer":      // has access to: viewer
                this.registerViewer(socket);
                break;
            case "inspect":      // has access to: inspect
                this.registerInspector(socket);
                break;
            case "judge":       // has access to: judge
                this.registerJudge(socket, socket.handshake.query.name);
                break;
            case "test":       // only for testing, disabled in productive environment!
                if (config.debugMode) {
                    this.registerTest(socket);
                }
                break;
            case "export":
                this.registerExport(socket);
                break;
            default:
                logger.warn("invalid clientType tries to register: " + clientType);
                socket.disconnect(true);
                return;
        }

        socket.emit("authenticated");
    }

    // ###############
    // #    ADMIN    #
    // ###############

    registerAdmin(socket) {
        // check if there is already an admin registered
        if (this.admin && this.admin.connected) {
            // TODO send some message
            socket.disconnect(true);
            logger.warn("admin request, but there is already a registered admin");
            return false;
        }

        this.admin = socket;
        AdminSocket.registerEvents(socket);

        socket.on('disconnect', () => {
            this.unregisterAdmin(socket);
            this.unregisterViewer(socket);
        });
        socket.on('error', this.unregisterAdmin.bind(this, socket));
        logger.info("admin connected");

    }

    unregisterAdmin(socket) {
        socket.disconnect(true);
        this.admin = null;
        logger.info("admin disconnected");
    }

    // #################
    // #    VIEWERS    #
    // #################

    registerViewer(socket) {

        ViewerSocket.registerEvents(socket);

        socket.on('disconnect', this.unregisterViewer.bind(this, socket));
        socket.on('error', this.unregisterViewer.bind(this, socket));

        this.viewers.push(socket);
        logger.info("new Viewer registered", {numViewers: this.viewers.length});
    }

    unregisterViewer(socket) {
        socket.disconnect(true);
        this.viewers = this.viewers.filter((value) => value.connected);
        logger.info("viewer disconnected", {numViewers: this.viewers.length});
    }

    sendToViewers(event, data) {
        for (var i = 0; i < this.viewers.length; i++) {
            this.viewers[i].emit(event, data);
        }
    }

    // ####################
    // #    INSPECTORS    #
    // ####################

    registerInspector(socket) {

        InspectSocket.registerEvents(socket);

        socket.on('disconnect', this.unregisterInspector.bind(this, socket));
        socket.on('error', this.unregisterInspector.bind(this, socket));

        logger.info("new Inspector registered");
    }

    unregisterInspector(socket) {
        socket.disconnect(true);
        logger.info("Inspector disconnected");
    }

    // ################
    // #    JUDGES    #
    // ################

    registerJudge(socket, name) {

        // define websocket events
        socket.on('submitJudgement', (data) => {
            controller.submissionHandler.handlerAVS.liveJudging.receiveLiveJudgement(socket, data);
        });

        socket.on('disconnect', this.unregisterJudge.bind(this, socket));
        socket.on('error', this.unregisterJudge.bind(this, socket));

        this.judges.push(socket);
        socket.judgeName = name;
        controller.submissionHandler.handlerAVS.liveJudging.judgeAvailable(socket);
        logger.info("new Judge registered", {judgeName: socket.judgeName, numJudges: this.judges.length});
    }

    unregisterJudge(socket) {
        socket.disconnect(true);
        controller.submissionHandler.handlerAVS.liveJudging.judgeDisconnect(socket);
        // remove disconnected judges from the list
        this.judges = this.judges.filter((value) => value.connected);
        logger.info("judge disconnected", {judgeName: socket.judgeName, numJudges: this.judges.length});
    }

    getAvailableJudge() {
        var availableJudges = this.judges.filter((j) => j.connected && !j.isJudging);
        if (availableJudges.length === 0) {
            return null;    // no judge available
        } else {
            var randomIdx = Math.floor(Math.random() * availableJudges.length);
            return availableJudges[randomIdx];  // randomly shuffle to give every judge the chance to get a submission (not always the first one...)
        }
    }

    sendToJudge(judge, data) {
        judge.emit('judge', data);
        logger.verbose("Submission is sent to judge", data);
    }

    // ##############
    // #    TEST    #
    // ##############

    // only for debugging!
    // test page also need admin privileges...
    registerTest(socket) {
        this.registerJudge(socket, "auto");
        this.registerViewer(socket);
        AdminSocket.registerEvents(socket);
    }

    // ################
    // #    EXPORT    #
    // ################

    registerExport(socket) {
        ExportSocket.registerEvents(socket);
        InspectSocket.registerEvents(socket);

        socket.on('disconnect', this.unregisterInspector.bind(this, socket));
        socket.on('error', this.unregisterInspector.bind(this, socket));

        logger.info("new Exporter registered");
    }

}

module.exports = SocketHandler;
