var controller = require('../Controller'),
        fs = require('fs-extra'),
        uniqueFilename = require('unique-filename'),
        path = require('path'),
        SubmissionHandlerAVS = require('../submission/SubmissionHandlerAVS'),
        svgBuilder = require('svg-builder');

var exportDir = "csv";
var exportPath = process.cwd() + "/public/" + exportDir + "/";

// TODO refactor, currently only a dirty hack...
// TODO extend for LSC tasks

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
                if (competition) {
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
                                    if (task.type.startsWith("KIS_Textual") || task.type.startsWith("KIS_VisualTextual")) {
                                        
                                        // Iterate over all texts
                                        let ii = 0
                                        for (; ii < Math.min(3, task.textList.length); ++ii)
                                        {
                                            csv += task.textList[ii].text.replace(/\r?\n|\r/g, " ") + ";";
                                        }
                                        for (; ii < 3; ++ii)
                                        {
                                            csv += ";";
                                        }
                                        
                                    } else {
                                        csv += ";;;";
                                        
                                    }
                                } else if (task.type.startsWith("AVS")) {
                                    csv += ";;;;;;" + task.trecvidId + ";" + task.avsText;
                                } else if (task.type.startsWith("LSC")) {
                                    csv += "TODO: implement export for LSC tasks";
                                }
                            }
                            csv += "\n";
                        }
                        ExportSocket.saveAndRespond(csv, "tasks", socket, callback);
                    });
                } else {

                }
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
            var csv = "taskId;taskType;expert/novice;teamNumber;teamName;teamMember;videoNumber;shotNumber;frameNumber;searchTime;judged;correct\n";
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
                                                + s.teamNumber + ";" + teamMap[s.teamId].name + ";" + s.memberNumber + ";"
                                                + s.videoNumber + ";" + s.shotNumber + ";" + s.frameNumber + ";"
                                                + s.searchTime + ";" + s.judged + ";" + s.correct + "\n";
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

                                // socket.respond(callback, true, csv);
                                ExportSocket.saveAndRespond(csv, "avsStatistics", socket, callback);

                            });
                        });
                    });
                });
            });
        });

        socket.on("exportSvgSubmissions", (data, callback) => 
        {
           

            // Find correct competition
            db.findCompetition({_id: data.competitionId}, (competition) => 
            {
                // Find submissions for this competition
                db.findSubmissions({competitionId: data.competitionId}, (submissions) => 
                {
                    // Find teams in this competition
                    db.findTeams({competitionId: data.competitionId}, (teams) => 
                    {
                        // Create team map variable
                        var teamMap = {};
                        for (var i = 0; i < teams.length; i++) {
                            teamMap[teams[i]._id] = teams[i];
                        }

                        // Find tasks for this
                        db.findTasks({competitionId: data.competitionId}, (tasks) => // load all tasks of this competition
                        {   
                            // Data for drawing
                            let minTaskSearchTime = 10000000;
                            let maxTaskSearchTime = 0;
                            let filteredTasks = new Array();
                            
                            
                            {
                                let ii = 0;
                                for (var i = 0; i < competition.taskSequence.length; i++) // proceed in the order of task execution
                                {     
                                    var taskId = competition.taskSequence[i];
                                    var task = tasks.find((t) => t._id == taskId);

                                    // If task has already finished
                                    if (task.finished) 
                                    {
                                        // Update min & max search times
                                        minTaskSearchTime = Math.min(minTaskSearchTime, task.maxSearchTime);
                                        maxTaskSearchTime = Math.max(maxTaskSearchTime, task.maxSearchTime);

                                        // Get submissions with this task ID only
                                        var sub = submissions.filter((s) => s.taskId == taskId);

                                        // Sort them chronologically
                                        sub.sort((a, b) => a.searchTime - b.searchTime);
                                        
                                        let taskDetail = JSON.parse(JSON.stringify(task));
                                        taskDetail.submissions = new Array();

                                        // Iterate through all submissions
                                        for (var j = 0; j < sub.length; j++) 
                                        {
                                            sub[j].teamColor = teamMap[sub[j].teamId].color;
                                            taskDetail.submissions.push(sub[j]);
                                            
                                        }



                                        filteredTasks.push(taskDetail);
                                        ++ii;
                                    }
                                }
                            }

                            const svgSettings = {
                                svgHeight: 3800,
                                topPadding: 100,
                                bottomPadding: 30,
                                rightPadding: 80,   
                                leftPadding: 120,
                                columnWitdth: 100,
                                leftLabelNegOffset: 70,
                                minTaskSearchTime: minTaskSearchTime,
                                maxTaskSearchTime: maxTaskSearchTime
                            };

                             // Create new SVG Builder
                            let svgXml = this.constructSubmissionSvg(svgSettings, filteredTasks, teams);
                            

                            // Save this file and resolve request
                            ExportSocket.saveAndRespondSvg(svgXml, "submissions", socket, callback);
                        });
                    });
                });
            });
        });
    }

    static constructSubmissionSvg(svgSettings, filteredTasks, teams) 
    {
        let svg = svgBuilder.newInstance();

        const taskTimelineWidth = 2;
        const yInterval = 30;
        const teamLineHeight = 20;

        const totalHeight = svgSettings.svgHeight + teams.length * teamLineHeight + 100;
        const innerHeight = svgSettings.svgHeight - (svgSettings.topPadding + svgSettings.bottomPadding);

        const oneTimeUnit = innerHeight / svgSettings.maxTaskSearchTime;

        const totalWidth = svgSettings.leftPadding + svgSettings.columnWitdth * filteredTasks.length + svgSettings.rightPadding;
        const innerWidth = totalWidth - svgSettings.leftPadding - svgSettings.rightPadding;
        // Set dimensions based on number of tasks
        svg.width(totalWidth)
            .height(totalHeight);

        const minMaxRatio = svgSettings.minTaskSearchTime / svgSettings.maxTaskSearchTime;

        const leftLabelNegOffset = svgSettings.leftLabelNegOffset;
        
        // Draw teams
        for (let ii = 0; ii < teams.length; ++ii)
        {
            const team = teams[ii];
            svg.text({
                x: svgSettings.leftPadding + 30,
                y: 40 +  svgSettings.topPadding + innerHeight + (ii * teamLineHeight) + 7,
                'font-family': 'arial',
                'font-size': 12,
                fill: team.color
            }, String(team.name));
    
            svg.line({
                x1: svgSettings.leftPadding,
                y1: 40 + svgSettings.topPadding + innerHeight + (ii * teamLineHeight),
                x2: svgSettings.leftPadding + 20,
                y2: 40 + svgSettings.topPadding + innerHeight + (ii * teamLineHeight),
                stroke: team.color,
                'stroke-width': 15
            });
        }

        // Draw grid
        for (let ii = 0; ii < svgSettings.maxTaskSearchTime; ii += yInterval)
        {
            svg.text({
                x: svgSettings.leftPadding - leftLabelNegOffset - 30,
                y: (svgSettings.topPadding + innerHeight) - (oneTimeUnit * ii) + 7,
                'font-family': 'arial',
                'font-size': 12,
                fill: '#aaa'
            }, String(ii));
    
            svg.line({
                x1: svgSettings.leftPadding - leftLabelNegOffset,
                y1: (svgSettings.topPadding + innerHeight) - (oneTimeUnit * ii),
                x2: svgSettings.leftPadding + innerWidth + leftLabelNegOffset,
                y2: (svgSettings.topPadding + innerHeight) - (oneTimeUnit * ii),
                stroke: '#aaa',
                'stroke-width': 0.5
            });
        }

        // Max time
        svg.text({
            x: svgSettings.leftPadding - leftLabelNegOffset - 30,
            y: svgSettings.topPadding+ 7,
            'font-family': 'arial',
            'font-size': 15,
            stroke : '#ff0000',
            fill: '#ff0000'
        }, String(svgSettings.maxTaskSearchTime));

        svg.line({
            x1: svgSettings.leftPadding - leftLabelNegOffset,
            y1: svgSettings.topPadding,
            x2: svgSettings.leftPadding + innerWidth + leftLabelNegOffset,
            y2: svgSettings.topPadding,
            stroke: '#ff0000',
            'stroke-width': 1
        });

        // Min time
        svg.text({
            x: svgSettings.leftPadding - leftLabelNegOffset - 30,
            y: svgSettings.topPadding + (innerHeight  - (innerHeight * minMaxRatio))+ 7,
            'font-family': 'arial',
            'font-size': 15,
            stroke : '#ffaa00',
            fill: '#ffaa00'
        }, String(svgSettings.minTaskSearchTime));

        svg.line({
            x1: svgSettings.leftPadding - leftLabelNegOffset,
            y1: svgSettings.topPadding + (innerHeight  - (innerHeight * minMaxRatio)),
            x2: svgSettings.leftPadding + innerWidth + leftLabelNegOffset,
            y2: svgSettings.topPadding + (innerHeight  - (innerHeight * minMaxRatio)),
            stroke: '#ffaa00',
            'stroke-width': 1
        });



        // Construct SVG structure
        for (let i = 0; i < filteredTasks.length; ++i)
        {
            const task = filteredTasks[i];

            // Left offset for this particular column
            const currLeftOffset = svgSettings.leftPadding + ((svgSettings.columnWitdth * i) - (svgSettings.columnWitdth / 2));

            // Task timeline
            svg.line({
                x1: currLeftOffset,
                y1: (svgSettings.topPadding + innerHeight) - (oneTimeUnit * task.maxSearchTime),
                x2: currLeftOffset,
                y2: svgSettings.topPadding + innerHeight,
                stroke: '#0373fc',
                'stroke-width': taskTimelineWidth
            });

            // Number
            svg.text({
                x: currLeftOffset - 10,
                y: svgSettings.topPadding - 80,
                'font-family': 'arial',
                'font-size': 20,
                stroke : '#000',
                fill: '#000'
            }, String(i + 1));

            // Name
            svg.text({
                x: currLeftOffset - 30,
                y: svgSettings.topPadding - 50,
                'font-family': 'arial',
                'font-size': 12,
                fill: '#aaa'
            }, task.name);

            // Type
            svg.text({
                x: currLeftOffset - 30,
                y: svgSettings.topPadding - 30,
                'font-family': 'arial',
                'font-size': 8,
                fill: '#000'
            }, task.type);

            const timelineDisOffset = parseFloat(taskTimelineWidth) / 2;

            // Draw submits
            for (let jj = 0; jj < task.submissions.length; ++jj)
            {
                
                const sub = task.submissions[jj];
                if (sub.correct == null)
                {
                    continue;
                }

                const radius = 5;
                const subLineWidth = 20;

                const crossSize = subLineWidth / 2;
                const crossLineWidth = 2;
                if (sub.correct)
                {
                    svg.line({
                        x1: currLeftOffset  + timelineDisOffset - crossSize,
                        y1: svgSettings.topPadding + (innerHeight - (oneTimeUnit * sub.searchTime)) + crossSize,
                        x2: currLeftOffset + timelineDisOffset + crossSize,
                        y2: svgSettings.topPadding + (innerHeight - (oneTimeUnit * sub.searchTime)) - crossSize,
                        stroke: sub.teamColor,
                        'stroke-width': crossLineWidth
                    });

                    svg.line({
                        x1: currLeftOffset + timelineDisOffset - crossSize,
                        y1: svgSettings.topPadding + (innerHeight - (oneTimeUnit * sub.searchTime)) - crossSize,
                        x2: currLeftOffset + timelineDisOffset + crossSize,
                        y2: svgSettings.topPadding + (innerHeight - (oneTimeUnit * sub.searchTime)) + crossSize,
                        stroke: sub.teamColor,
                        'stroke-width': crossLineWidth
                    });
                }
                else 
                {
                    svg.line({
                        x1: currLeftOffset - (subLineWidth / 2) + timelineDisOffset,
                        y1: svgSettings.topPadding + (innerHeight - (oneTimeUnit * sub.searchTime)),
                        x2: currLeftOffset + subLineWidth - (subLineWidth / 2)  + timelineDisOffset,
                        y2: svgSettings.topPadding + (innerHeight - (oneTimeUnit * sub.searchTime)),
                        stroke: sub.teamColor,
                        'stroke-width': crossLineWidth
                    });
                }

                
            }
        }

        // Render final SVG
        return svg.render();
    }

    static saveAndRespondSvg(svg, label, socket, callback) {
        var fileName = uniqueFilename(exportPath, label) + ".svg";
        fs.writeFileSync(fileName, svg);
        socket.respond(callback, true, exportDir + "/" + path.parse(fileName).base);
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
