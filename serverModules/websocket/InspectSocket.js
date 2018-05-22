var controller = require('../Controller'),
        CompetitionState = require('../CompetitionState');

class InspectSocket {

    static registerEvents(socket) {

        var db = controller.db;

        // return the competitionState of a Competition at an arbitrary point in the task sequence
        socket.on("getCompetitionState", (data, callback) => {
            db.findCompetition({_id: data.competitionId}, (competition) => {
                if (!competition) {
                    socket.respond(callback, false, "competition not found...");
                } else {
                    CompetitionState.reconstructFromDatabase(competition, db, (competitionState) => {
                        socket.respond(callback, true, competitionState);
                    }, (err) => {
                        socket.respond(callback, false, "Reconstruction CompetitionState failed: " + err);
                    });
                }
            }, (err) => {
                socket.respond(callback, false, err);
            });
        });

        socket.on("getSubmissions", (data, callback) => {
            db.findSubmissions({competitionId: data.competitionId, taskId: data.taskId}, (submissions) => {
                socket.respond(callback, true, submissions);
            }, (err) => {
                socket.respond(callback, false, err);
            });
        });

        socket.on("getAVSStatistics", (data, callback) => {
            // TODO
        });

        socket.on("getVideoMap", (data, callback) => {
            socket.respond(callback, true, controller.videoMap);
        });

    }
}

module.exports = InspectSocket;
