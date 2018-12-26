var trecvidGroundTruth = require('./2018/trecvidGroundTruth.json');


var importGroundTruth = (db) => {

    db.deleteEntities(db.db.groundTruth, true, (numDeleted) => {
        console.log("ground truth database cleared (" + numDeleted + " deleted)");
        var groundTruthEntries = new Array();
        // format: {trecvidId, videoNumber, shotNumber, correct, vbsJudged}

        var count = 0;

        for (var trecvidId in trecvidGroundTruth) {
            for (var videoNumber in trecvidGroundTruth[trecvidId]) {
                for (var shotNumber in trecvidGroundTruth[trecvidId][videoNumber]) {
                    var entry = {
                        trecvidId: trecvidId + "",  // make sure that trecvidId is a string! (otherwise lookup might fail)
                        videoNumber: parseInt(videoNumber),
                        shotNumber: parseInt(shotNumber),
                        correct: trecvidGroundTruth[trecvidId][videoNumber][shotNumber],
                        judge: "tv" // judged by trecvid
                    };
                    groundTruthEntries.push(entry);
                    if (count++ % 10000 == 0)   // just show some entries to check if everything is ok
                        console.log(entry);
                }
            }
        }

        console.log(groundTruthEntries.length + " groundTruthEntries");

        db.createEntities(db.db.groundTruth, groundTruthEntries, {}, (newDocs) => {
            console.log("inserted: " + newDocs.length);
        }, (err) => {
            console.log("insertion failed: " + err);
        });

    }, (err) => {
        console.error("error when clearing ground truth database: " + err)
    });

}


module.exports = importGroundTruth;
