var controller = require('../Controller');

class ViewerSocket {

    static registerEvents(socket) {

        var db = controller.db;
        
        socket.on("getCompetitionState", (data, callback) => {            
            socket.respond(callback, true, controller.competitionState);
        });
        
        socket.on("getVideoMap", (data, callback) => {  
            socket.respond(callback, true, controller.videoMap);
        });        
        
    }
}

module.exports = ViewerSocket;
