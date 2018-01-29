var titleMap = require('./dataset/titleMap.json'),
        fpsMap = require('./dataset/fpsMap.json'),
        msb = require('./dataset/msb.json'),
        Video = require('../serverModules/entities/Video');

var importVideos = (db) => {

    db.deleteEntities(db.db.videos, true, (numDeleted) => {
        console.log("video database cleared (" + numDeleted + " deleted)");

        var videos = new Array();

        for (var key in titleMap) {

            var numFrames = msb[key][msb[key].length - 1] + 1;  // frame index starts at 1
            var shots = [];
            for (var i = 0; i < msb[key].length; i++) {
                shots.push({
                    from: (i > 0) ? msb[key][i - 1] + 1 : 0,
                    to: msb[key][i]
                });
            }

            // TODO duplicates

            var video = new Video({
                videoNumber: parseInt(key),
                filename: titleMap[key] + ".mp4",
                numFrames: numFrames,
                fps: fpsMap[key],
                shots: shots
            });

            videos.push(video);

//        db.createEntity(db.db.video, video, true, (newDoc) => {
//            console.log(videos inserted: " + newDoc);
//        }, (err) => {
//            console.log("video insertion failed: " + err);
//        });
        }

        console.log(videos.length + " videos");

        db.createEntities(db.db.videos, videos, {}, (newDocs) => {
            console.log("videos inserted: " + newDocs.length);
        }, (err) => {
            console.log("video insertion failed: " + err);
        });
        
    }, (err) => {
        console.error("error when clearing video database: " + err)
    });
}

module.exports = importVideos;
