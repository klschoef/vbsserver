var logger = require('winston'),
        controller = require('../Controller'),
        config = require('../../config.json'),
        AdminSocket = require('./AdminSocket'),
        ViewerSocket = require('./ViewerSocket');

class SocketHandler {
    constructor(io) {

        this.io = io;

        this.admin = null;          // web socket for Admin user (we only allow one admin connection at a time!)
        this.viewers = new Array(); // web sockets for Viewer users (multiple connections allowed, but login required)
        this.judges = new Array();  // web sockets for registered judges
        // TODO inspector sockets        

        /*
         * The admin user can maintain the list of teams and tasks, start/stop tasks and select already performed tasks to be displayed (at Viewer)
         * Viewer users see the current query, timer, submissions and chart. The "current" query can either be a running one or an already finished one.
         * Both types of users need to login (via websocket).
         */

        io.on('connection', (socket) => {

            // TODO authentication (type, user, pwd)
            // TODO using express ?? ("Middleware", next)
            // TODO use sessions (reload, page change etc.)
            var clientType = socket.handshake.query.clientType;

            // unified format for web socket callbacks
            // success: boolean indicating whether the request was successfully fulfilled
            // data: requested data (if requested), error message in case of error
            socket.respond = (callback, success, data) => {
                callback({success: success, data: data});
            };

            switch (clientType) {
                case "admin":       // has access to: edit,control,viewer,inspect
                    this.registerAdmin(socket);
                    this.registerViewer(socket);
                    break;
                case "viewer":      // has access to: viewer,inspect
                    this.registerViewer(socket);
                    break;
                case "judge":       // has access to: judge
                    this.registerJudge(socket, socket.handshake.query.name);
                    break;
                case "test":       // only for testing, disabled in productive environment!
                    if (config.debugMode) {
                        this.registerTest(socket);
                    }
                    break;
                default:
                    logger.warn("invalid clientType tries to register: " + clientType);
                    socket.disconnect(true);
                    break;
            }


            socket.on('authenticate', () => {
                // ??? login...
            });


        });
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

}

module.exports = SocketHandler;
