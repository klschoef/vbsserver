var controller = require('../Controller');

class ViewerSocket {

    static registerEvents(socket) {

        var db = controller.db;

        socket.on("getCompetitionState", (data, callback) => {
            socket.respond(callback, true, controller.competitionState);
        });

        socket.on("getVideoMap", (data, callback) => {
            var response = controller.videoMap;

            // transferring the whole map with all shots takes a few seconds (even on local machine),
            // but this information is not always needed, so it can be skipped
            // (this filtering only takes a few ms for the 7500 videos of V3C1)
            if (data.skipShots) {
                response = {};
                for (var videoId in controller.videoMap) {
                    var video = {};
                    var v = controller.videoMap[videoId];
                    for (var key in v) {
                        if (key != "shots") {
                            video[key] = v[key];
                        }
                    }
                    response[videoId] = video;
                };
            }

            socket.respond(callback, true, response);
        });

    }
}

module.exports = ViewerSocket;
