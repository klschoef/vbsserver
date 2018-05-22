var controller = require('../Controller'),
        fs = require('fs-extra'),
        uniqueFilename = require('unique-filename'),
        path = require('path'),
        SubmissionHandlerAVS = require('../submission/SubmissionHandlerAVS');

var exportDir = "csv";
var exportPath = process.cwd() + "/public/" + exportDir + "/";

// TODO refactor, currently only a dirty hack...

class ExportSocket {

    static registerEvents(socket) {

        var db = controller.db;

        // make sure that required directories exist
        if (!fs.existsSync(exportPath)) {
            fs.mkdirSync(exportPath);
            console.log("creating directory '" + exportPath + "'");
        }

        socket.on("exportTasks", (data, callback) => {
            var csv = "taskId;name;startTime;maxSearchTime;type;videoNumber;startFrame;endFrame;text1;text2;text3;trecvidId;avsText\n";
            db.findCompetition({_id: data.competitionId}, (competition) => {
                db.findTasks({competitionId: data.competitionId}, (tasks) => {  // load all tasks of this competition
                    for (var i = 0; i < competition.taskSequence.length; i++) {     // proceed in the order of task execution
                        var taskId = competition.taskSequence[i];
                        var taskIdx = i + 1;
                        var task = tasks.find((t) => t._id == taskId);
                        if (task.finished) {
                            csv += taskIdx + ";" + task.name + ";" + (new Date(task.startTimeStamp)).toLocaleString() + ";"
                                    + task.maxSearchTime + ";" + task.type + ";";
                            if (task.type.startsWith("KIS")) {
                                var r = task.videoRanges[0];
                                csv += r.videoNumber + ";" + r.startFrame + ";" + r.endFrame + ";";
                                if (task.type.startsWith("KIS_Textual")) {
                                    csv += task.textList[0].text.replace(/\r?\n|\r/g, " ") + ";"
                                            + task.textList[1].text.replace(/\r?\n|\r/g, " ") + ";"
                                            + task.textList[2].text.replace(/\r?\n|\r/g, " ") + ";";
                                } else {
                                    csv += ";;;";
                                }
                            } else {
                                csv += ";;;;;;" + task.trecvidId + ";" + task.avsText;
                            }
                        }
                        csv += "\n";
                    }
                    ExportSocket.saveAndRespond(csv, "tasks", socket, callback);
                });
            });
        });

        socket.on("exportTaskResults", (data, callback) => {
            var csv = "year;team;isTop3;taskId;taskType;desc;trecvidId;expert/novice;searchTime;numAttempts;success;score\n";
            db.findCompetition({_id: data.competitionId}, (competition) => {
                var year = (new Date(competition.startTimeStamp)).getFullYear();
                db.findTasks({competitionId: data.competitionId}, (tasks) => {                  // load all tasks of this competition
                    db.findTaskResults({competitionId: data.competitionId}, (taskResults) => {  // load all task results of this competition
                        db.findTeams({competitionId: data.competitionId}, (teams) => {     // load all teams of this competition
                            var teamMap = {};
                            for (var i = 0; i < teams.length; i++) {
                                teamMap[teams[i]._id] = teams[i];
                            }
                            for (var i = 0; i < competition.taskSequence.length; i++) {     // proceed in the order of task execution
                                var taskId = competition.taskSequence[i];
                                var taskIdx = i + 1;
                                var task = tasks.find((t) => t._id == taskId);
                                if (task.finished) {
                                    var results = taskResults.filter((t) => t.taskId == taskId);
                                    for (var j = 0; j < results.length; j++) {
                                        var tr = results[j];
                                        var teamName = teamMap[tr.teamId].name;
                                        var isTop3 = "";
                                        csv += year + ";" + teamName + ";" + isTop3 + ";"
                                                + taskIdx + ";" + task.type + ";" + task.name + ";"
                                                + (task.type.startsWith("AVS") ? task.trecvidId : "") + ";"
                                                + (task.type.includes("novice") ? "novice" : "expert") + ";"
                                                + ((tr.searchTimes.length > 0) ? tr.searchTimes[0] : task.maxSearchTime) + ";"
                                                + tr.numAttempts + ";" + ((tr.numCorrect > 0) ? true : false) + ";" + tr.taskScore + "\n";
                                    }
                                }
                            }
                            ExportSocket.saveAndRespond(csv, "taskResults", socket, callback);
                        });
                    });
                });
            });
        });

        socket.on("exportSubmissions", (data, callback) => {
            var csv = "taskId;taskType;expert/novice;teamNumber;teamName;videoNumber;shotNumber;frameNumber;searchTime;judged;correct;iseq\n";
            db.findCompetition({_id: data.competitionId}, (competition) => {
                db.findSubmissions({competitionId: data.competitionId}, (submissions) => {
                    db.findTeams({competitionId: data.competitionId}, (teams) => {
                        var teamMap = {};
                        for (var i = 0; i < teams.length; i++) {
                            teamMap[teams[i]._id] = teams[i];
                        }
                        db.findTasks({competitionId: data.competitionId}, (tasks) => {      // load all tasks of this competition
                            for (var i = 0; i < competition.taskSequence.length; i++) {     // proceed in the order of task execution
                                var taskId = competition.taskSequence[i];
                                var taskIdx = i + 1;
                                var task = tasks.find((t) => t._id == taskId);
                                if (task.finished) {
                                    var sub = submissions.filter((s) => s.taskId == taskId);
                                    sub.sort((a, b) => a.searchTime - b.searchTime);
                                    for (var j = 0; j < sub.length; j++) {
                                        var s = sub[j];
                                        csv += taskIdx + ";" + task.type + ";" + (task.type.includes("novice") ? "novice" : "expert") + ";"
                                                + s.teamNumber + ";" + teamMap[s.teamId].name + ";"
                                                + s.videoNumber + ";" + s.shotNumber + ";" + s.frameNumber + ";"
                                                + s.searchTime + ";" + s.judged + ";" + s.correct + ";" + s.iseq + "\n";
                                    }
                                }
                            }
                            ExportSocket.saveAndRespond(csv, "submissions", socket, callback);
                        });
                    });
                });
            });
        });

        socket.on("exportAvsStatistics", (data, callback) => {
            var csv = "taskId;team;total;correct;incorrect;ranges;videos;score\n";

            db.findCompetition({_id: data.competitionId}, (competition) => {
                db.findTeams({competitionId: data.competitionId}, (teams) => {
                    var teamMap = {};
                    for (var i = 0; i < teams.length; i++) {
                        teamMap[teams[i]._id] = teams[i];
                    }
                    db.findTasks({competitionId: data.competitionId, type: /AVS/, finished: true}, (tasks) => {      // load all finished AVS tasks                    
                        var taskIds = tasks.map((t) => t._id);
                        db.findTaskResults({taskId: {$in: taskIds}}, (taskResults) => {

                            taskResults.sort((a, b) => {
                                var taskIdxA = competition.taskSequence.indexOf(a.taskId) + 1;
                                var taskIdxB = competition.taskSequence.indexOf(b.taskId) + 1;
                                if (taskIdxA != taskIdxB) {
                                    return taskIdxA - taskIdxB;
                                } else if (teamMap[a.teamId].name < teamMap[b.teamId].name) {
                                    return -1;
                                } else if (teamMap[a.teamId].name > teamMap[b.teamId].name) {
                                    return 1;
                                }
                                return 0;
                            });

                            for (var i = 0; i < taskResults.length; i++) {
                                var tr = taskResults[i];
                                var taskIdx = competition.taskSequence.indexOf(tr.taskId) + 1;
                                csv += taskIdx + ";" + teamMap[tr.teamId].name + ";"
                                        + tr.numAttempts + ";" + tr.numCorrect + ";" + tr.numWrong + ";"
                                        + tr.numRanges + ";" + tr.numVideos + ";" + tr.taskScore + "\n";
                            }

                            db.findSubmissions({taskId: {$in: taskIds}}, (submissions) => {

                                tasks.sort((a, b) => {
                                    var taskIdxA = competition.taskSequence.indexOf(a._id) + 1;
                                    var taskIdxB = competition.taskSequence.indexOf(b._id) + 1;
                                    return taskIdxA - taskIdxB;
                                });

                                csv += "taskId;submissions;correct;shots;ranges;videos\n";
                                for (var i = 0; i < tasks.length; i++) {
                                    var task = tasks[i];
                                    var taskIdx = competition.taskSequence.indexOf(task._id) + 1;
                                    var taskSubmissions = submissions.filter((s) => s.taskId == task._id);
                                    var correctSubmissions = taskSubmissions.filter((s) => s.correct);
                                    var numSubmissions = taskSubmissions.length;
                                    var numCorrect = correctSubmissions.length
                                    var numVideos = (new Set(correctSubmissions.map((s) => s.videoNumber))).size;
                                    var numShots = (new Set(correctSubmissions.map((s) => s.videoNumber + "_" + s.shotNumber))).size;                                    
                                    var avsHandler = new SubmissionHandlerAVS({db: db});
                                    for (var j=0; j<taskSubmissions.length; j++) {
                                        avsHandler.extendCorrectPool(taskSubmissions[j]);
                                    }
                                    var numRanges = avsHandler.numRanges;

                                    csv += taskIdx + ";" + numSubmissions + ";" + numCorrect + ";" 
                                            + numShots + ";" + numRanges + ";" + numVideos + "\n";
                                }

                                socket.respond(callback, true, csv);
//                            ExportSocket.saveAndRespond(csv, "avsStatistics", socket, callback);

                            });
                        });
                    });
                });
            });
        });
    }

    static saveAndRespond(csv, label, socket, callback) {
        var fileName = uniqueFilename(exportPath, label) + ".csv";
        fs.writeFileSync(fileName, csv);
        socket.respond(callback, true, exportDir + "/" + path.parse(fileName).base);
    }

    exportResultsCsv(competitionId, year) {

        // export groundtruth
        var str3 = "trecvidId;videoNumber;shotNumber;correct;judge\n"
        this.db.findEntity(this.db.db.groundTruth, {}, (groundTruth) => {
            for (var i = 0; i < groundTruth.length; i++) {
                var gt = groundTruth[i];
                str3 += gt.trecvidId + ";" + gt.videoNumber + ";" + gt.shotNumber + ";" + gt.correct + ";" + gt.judge + "\n";
            }
            fs.writeFileSync("export_groundtruth.csv", str3);
            console.log("groundtruth export successful");
        }, () => {
        }, true);

    }
}

module.exports = ExportSocket;
