var fs = require('fs'),
        uniqueFilename = require('unique-filename'),
        controller = require('../Controller'),
        logger = require('winston'),
        async = require('async'),
        CompetitionState = require('../CompetitionState');

class AdminSocket {

    static registerEvents(socket) {

        var db = controller.db;
        AdminSocket.registerControlEvents(socket);
        AdminSocket.registerLoadEvents(socket, db);
        AdminSocket.registerCreateEvents(socket, db);
        AdminSocket.registerUpdateEvents(socket, db);
        AdminSocket.registerDeleteEvents(socket, db);
        AdminSocket.registerFurtherEvents(socket, db);
    }

    static registerControlEvents(socket) {
        var createControlEvent = (event, method, field) => {
            socket.on(event, (data, callback) => {
                if (field) {
                    method(data[field], () => {
                        socket.respond(callback, true);
                    }, (errorMsg) => {
                        socket.respond(callback, false, errorMsg);
                    });
                } else {
                    method(() => {
                        socket.respond(callback, true);
                    }, (errorMsg) => {
                        socket.respond(callback, false, errorMsg);
                    });
                }
            });
        }
        createControlEvent("startCompetition", controller.startCompetition.bind(controller), "competitionId");
        createControlEvent("stopCompetition", controller.stopCurrentCompetition.bind(controller));
        createControlEvent("startTask", controller.startTask.bind(controller), "taskId");
        createControlEvent("stopTask", controller.stopCurrentTask.bind(controller));
    }

    static createDbEvent(socket, event, method, log) {
        socket.on(event, (requestData, callback) => {
            method(requestData, (responseData) => {
                socket.respond(callback, true, responseData);
                if (log) {
                    logger.info(event, requestData);
                }
            }, (errorMsg) => {
                socket.respond(callback, false, errorMsg);
            });
        });
    }

    static registerLoadEvents(socket, db) {
        AdminSocket.createDbEvent(socket, "loadUsers", db.findUsers.bind(db));
        AdminSocket.createDbEvent(socket, "loadCompetitions", db.findCompetitions.bind(db));
        AdminSocket.createDbEvent(socket, "loadTasks", db.findTasks.bind(db));
        AdminSocket.createDbEvent(socket, "loadTask", db.findTask.bind(db));
        AdminSocket.createDbEvent(socket, "loadTeams", db.findTeams.bind(db));
    }

    static registerCreateEvents(socket, db) {
        AdminSocket.createDbEvent(socket, "createUser", db.createUser.bind(db), true);
        AdminSocket.createDbEvent(socket, "createCompetition", db.createCompetition.bind(db), true);
        AdminSocket.createDbEvent(socket, "createTask", db.createTask.bind(db), true);
        AdminSocket.createDbEvent(socket, "createTeam", db.createTeam.bind(db), true);
    }

    static registerUpdateEvents(socket, db) {
        AdminSocket.createDbEvent(socket, "updateUser", db.updateUser.bind(db), true);
        AdminSocket.createDbEvent(socket, "updateCompetition", db.updateCompetition.bind(db), true);
        AdminSocket.createDbEvent(socket, "updateTask", db.updateTask.bind(db), true);
        AdminSocket.createDbEvent(socket, "updateTeam", db.updateTeam.bind(db), true);
    }

    static registerDeleteEvents(socket, db) {
        AdminSocket.createDbEvent(socket, "deleteUser", db.deleteUser.bind(db), true);
        AdminSocket.createDbEvent(socket, "deleteCompetition", db.deleteCompetition.bind(db), true);
        AdminSocket.createDbEvent(socket, "deleteTask", db.deleteTask.bind(db), true);
        AdminSocket.createDbEvent(socket, "deleteTeam", db.deleteTeam.bind(db), true);
    }

    static registerFurtherEvents(socket, db) {

        socket.on("uploadTeamLogo", (data, callback) => {
            var logoPath = uniqueFilename(process.cwd() + "/public/images/logos/upload/", "logo_") + ".png";
            var logoSrc = logoPath.substr(logoPath.indexOf("images"));
            var base64Data = data.replace(/^data:image\/png;base64,/, "");
            base64Data += base64Data.replace('+', ' ');
            var binaryData = new Buffer(base64Data, 'base64').toString('binary');
            fs.writeFile(logoPath, binaryData, 'binary', (err) => {
                if (err) {
                    socket.respond(callback, false, {err});
                } else {
                    socket.respond(callback, true, {logoSrc: logoSrc});
                }
            });
        });

        socket.on("randomVideo", (data, callback) => {
            db.randomVideo((randomVideo) => {
                socket.respond(callback, true, randomVideo);
            }, (err) => {
                socket.respond(callback, false, {errorMsg: err});
            });
        });

        // creates a copy of 
        //      - the competition
        //      - all teams
        //      - all tasks
        // but does not copy submissions and taskResults
        socket.on("cloneCompetition", (data, callback) => {
            var oldCompetition = data;
            db.createCompetition({name: oldCompetition.name + "_clone"}, (newCompetition) => {

                var promises = [];
                promises.push(new Promise((resolve, reject) => {
                    db.findTeams({competitionId: oldCompetition._id}, (teams) => {
                        async.each(teams, (team, finished) => {
                            db.createTeam({
                                competitionId: newCompetition._id,
                                teamNumber: team.teamNumber,
                                name: team.name,
                                color: team.color,
                                logoSrc: team.logoSrc
                            }, (team) => {
                                finished();
                            }, (err) => {
                                finished("Team creation failed: " + err);
                            });
                        }, (err) => {
                            if (err) {
                                reject("Finding teams failed: " + err);
                            } else {
                                resolve();
                            }
                        });
                    });
                }));

                promises.push(new Promise((resolve, reject) => {
                    db.findTasks({competitionId: oldCompetition._id}, (tasks) => {
                        async.each(tasks, (task, finished) => {
                            db.createTask({
                                competitionId: newCompetition._id,
                                name: task.name,
                                maxSearchTime: task.maxSearchTime,
                                type: task.type,
                                videoRanges: task.videoRanges,
                                textList: task.textList,
                                trecvidId: task.trecvidId,
                                avsText: task.avsText
                            }, (task) => {
                                finished();
                            }, (err) => {
                                finished("Task creation failed: " + err);
                            });
                        }, (err) => {
                            if (err) {
                                reject("Finding tasks failed: " + err);
                            } else {
                                resolve();
                            }
                        });
                    });
                }));

                Promise.all(promises).then(() => {
                    socket.respond(callback, true, newCompetition); // return the new competition after tasks and teams have been cloned as well
                }, (err) => {
                    db.deleteCompetition(newCompetition);   // something went wrong, but we want all or nothing ;)
                    socket.respond(callback, false, err);
                });
            }, (err) => {
                socket.respond(callback, false, {errorMsg: err});
            });
        });


        // a task that already has been started (and maybe finished) can be reset, meaning that
        //  - the taskId is removed form the corresponding competitions taskSequence 
        //      (and if this task is currently running, currentTaskId is reset)
        //  - all corresponding submissions are deleted
        //  - all corresponding taskResults are deleted
        //  - the running/finished flags and timestamps are reset        
        //  - competitionState has to be re-computed
        // TODO properly test if this really works in any situation...
        socket.on("resetTask", (data, callback) => {
            db.findTask({_id: data.taskId}, (task) => {
                controller.currentTask((currentTask) => {
                    // we only allow to reset a task if
                    //  - it is currently running or
                    //  - no other task is running
                    // i.e., a task cannot be reset while another task is running (to avoid potential inconsistencies, e.g., with aborted judge requests)
                    if (controller.isTaskRunning() && currentTask._id !== task._id) {
                        socket.respond(callback, false, "Task cannot be reset while another task is running");
                    } else {
                        task.running = false;
                        task.finished = false;
                        task.startTimeStamp = null;
                        task.endTimeStamp = null;

                        if (controller.competitionState
                                && controller.competitionState.tasks[controller.competitionState.activeTaskIdx]
                                && controller.competitionState.tasks[controller.competitionState.activeTaskIdx]._id === task._id) {
                            // stop the task
                            controller.stopCurrentTask();
                            // also stop potentially open judgements which could interfere!
                            controller.submissionHandler.handlerAVS.liveJudging.clearQueue();
                        }

                        db.findCompetition({_id: task.competitionId}, (competition) => {
                            var idx = competition.taskSequence.indexOf(task._id);
                            if (idx > -1) {
                                competition.taskSequence.splice(idx, 1);    // remove the task from the task sequence
                            }
                            if (competition.currentTaskId === task._id) {
                                competition.currentTaskId = null;
                            }

                            async.parallel([
                                (finished) => {
                                    db.updateCompetition(competition, finished, finished);
                                },
                                (finished) => {
                                    db.updateTask(task, finished, finished);
                                },
                                (finished) => {
                                    db.deleteSubmissions({competitionId: competition._id, taskId: task._id}, finished, finished);
                                },
                                (finished) => {
                                    db.deleteTaskResults({competitionId: competition._id, taskId: task._id}, finished, finished);
                                }
                            ], (err, results) => {
                                if (controller.competitionState
                                        && controller.competitionState.competitionId === competition._id) {
                                    // if the reset concerns the current competition,
                                    // completely refresh the competitionState (after the database is fully updated)
                                    CompetitionState.reconstructFromDatabase(competition, db, (competitionState) => {
                                        controller.currentCompetition = competition;
                                        controller.competitionState = competitionState;
                                        logger.info("Competition has been updated", competition.name);
                                        socket.respond(callback, true);
                                    });
                                } else {
                                    socket.respond(callback, true);
                                }
                            });

                        }, (err) => {
                            socket.respond(callback, false, err);
                        });
                    }
                });
            }, (err) => {
                socket.respond(callback, false, err);
            });
        });
    }
}

module.exports = AdminSocket;
