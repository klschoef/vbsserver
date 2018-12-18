var videoList = require('./videos.json'),
        Video = require('../serverModules/entities/Video');

var importVideos2 = (db) => {

    db.deleteEntities(db.db.videos, true, (numDeleted) => {
        console.log("video database cleared (" + numDeleted + " deleted)");

        var videos = new Array();

        for (var i=0; i<videoList.length; i++) {

			var v = videoList[i];
            var video = new Video({
                videoNumber: v.videoNumber,
                filename: v.filename,
                numFrames: v.numFrames,
                fps: v.fps,
                shots: v.shots
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

module.exports = importVideos2;
