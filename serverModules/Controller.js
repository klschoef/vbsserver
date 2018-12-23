var Competition = require('./entities/Competition'),
        logger = require('winston'),
        Task = require('./entities/Task'),
        config = require('../config.json'),
        async = require("async"),
        fs = require("fs"),
        // following modules are required during initialization because they require controller.
        // if they are required here, controller is not exported yet!
        CompetitionState,
        Routes,
        SubmissionHandler,
        Database,
        SocketHandler;

        // helper scripts that have been used for import of new dataset
//		    importVideos = require('../helper/VideoImport2');
//        importVideos = require('../helper/VideoImport'),
//        importGroundTruth = require('../helper/GroundTruthImport');

// some callbacks should be optional
var optional = (callback) => {
    if (typeof callback !== "function") {
        return () => {
            // dummy function, in case no callback is defined (so we don't get an Error)
        };
    } else {
        return callback;
    }
};

class Controller {

    init(app, io) {

        // require necessary modules ("classes")
        CompetitionState = require('./CompetitionState');
        Routes = require('./Routes');
        SubmissionHandler = require('./submission/SubmissionHandler');
        Database = require('./Database');
        SocketHandler = require('./websocket/SocketHandler');

        // all entities are managed by the Database instance
        // this also includes reconstruction of the server state (e.g., after crash during competition)
        this.db = new Database();
        // no NOTHING before the database is initialized
        this.db.init().then(() => {
            // if currently a competition is running, the according object is stored here
            // during a running competition, several features are disabled (like editing completed tasks of this competition etc.)
            this.currentCompetition = null;
            // object summarizing all relevant results and infos of the current competition
            // (is mainly used for communication with client)
            this.competitionState = null;

            this.taskTimeout = null;    // stores a timeout that stops the task after maxSearchTime
            this.taskInterval = null;   // notifies clients about the remaining time periodically
            this.countdownInterval = null   // countdown before task start

            // due to "minimal time difference guarantee", submission can (under special circumstances) still be valid after task finished
            // i.e., if a correct submission is submitted less than KISTimeTolerance seconds before the deadline,
            // the deadline is extended for KISTimeTolerance seconds (counted from the other submission timestamp)
            // this eliminates the unfair situation where one team submits shortly before the deadline and gets points,
            // while another team submits only shortly later, but misses the deadline and gets zero points
            // in this case, toleranceTask is set for that short time span
            // note: currently only implemented for KIS tasks (for AVS it is far more complicated,
            // as it's possible that a positive judgement that would trigger the time tolerance arrives after the deadline)
            this.toleranceTask = null;
            this.toleranceTaskTimeout = null;   // we also need a reference to the timeout here, otherwise we can't stop it

            this.db.findVideos({}, (videos) => {

                // hold videoMap in memory for easier access
                this.videoMap = {};
                for (var i = 0; i < videos.length; i++) {
                    this.videoMap[videos[i].videoNumber] = videos[i];
                }

                // and then setup web server etc.
                this.submissionHandler = new SubmissionHandler();
                this.app = app; // express app
                this.socket = new SocketHandler(io); // web sockets for communication with clients (are initialized later)
                this.routes = new Routes(app);    // GET and POST routes

                // reconstruct current competition state from database (e.g., after crash)
                this.reconstructServerState().then(() => {

                    logger.info("SERVER READY");

                    // importVideos(this.db);
                    // importGroundTruth(this.db);
                }, (rejectReason) => {
                    logger.warn("reconstructing server state failed", rejectReason);
                });
            }, (err) => {
                logger.error("loading video info failed", {errorMsg: err});
            });
        });
    }


    // reconstruct current competition state from database (e.g., after crash)
    reconstructServerState() {
        return new Promise((resolve, reject) => {
            // first check the database for a currently running competition
            // if it exists, currentCompetition is set accordingly
            logger.info("checking for running competition/task");
            // TODO check database consistency?
            this.db.isCompetitionRunning((competition) => {
                if (competition) {
                    CompetitionState.reconstructFromDatabase(competition, this.db, (competitionState) => {
                        this.currentCompetition = competition;
                        this.competitionState = competitionState;

                        // competitionState already contains all submissions of the "active" task, i.e., the latest task.
                        // - check whether there are unjudged submissions left
                        // - reconstruct correctPool
                        this.submissionHandler.handlerAVS.reconstruct(competitionState);

                        logger.info("resuming competition", competition.name);
                        if (this.socket) {
                            this.socket.sendToViewers("fullRefresh", competitionState);
                        }
                        // currently a task is running
                        // first check if it has expired or is still valid
                        this.currentTask((task) => {
                            if (task) {
                                var remainingTime = Task.getRemainingTime(task);
                                if (remainingTime > 0) {
                                    this.db.disableAutocompaction();
                                    logger.info("resuming task", {taskName: task.name, remainingTime: remainingTime});
                                    // set timeout that stops the task after maxSearchTime
                                    // set inverval for client timer updates
                                    this.taskInterval = setInterval(() => {
                                        var time = Task.getRemainingTime(task);
                                        if (time > 0) {
                                            this.timerTick(task);
                                        } else {
                                            clearInterval(this.taskInterval);
                                        }
                                    }, 1000);
                                    this.taskTimeout = setTimeout(() => {
                                        this.stopCurrentTask();
                                    }, remainingTime * 1000);
                                    resolve();
                                } else {
                                    // task has expired
                                    logger.info("task has already expired and is now stopped", task.name);
                                    this.stopCurrentTask();
                                    resolve();
                                }
                            } else {
                                resolve();
                            }
                        });
                    }, (err) => {
                        logger.error("competition could not be reconstructed from database", {errorMsg: err});
                        reject();
                    });
                } else {
                    resolve();
                }
            }, (err) => {
                logger.error("check for running competition failed", err);
            });
        });
    }

    timerTick(task) {
        this.socket.sendToViewers("remainingTime", {time: Task.getRemainingTime(task)});
    }

    // checks if currently a competition is running.
    // if so, returns the _id, otherwise false
    isCompetitionRunning() {
        if (this.currentCompetition !== null && this.currentCompetition.running) {
            return this.currentCompetition._id;
        }
        return false;
    }

    // tries to start a new competition with given id
    // in case of success, success callback is called and delivers the Competition object
    // otherwise, error callback is called with an error message
    startCompetition(competitionId, success, error) {
        error = optional(error);
        this.db.findCompetition({_id: competitionId}, (competition) => {
            if (!competition) {
                error("No competition found with id " + competitionId);
            } else if (this.isCompetitionRunning()) {
                error("Cannot start competition: there is already one running");
            } else if (competition.finished) {
                error("Cannot start competition: has already been finished");
            } else {
                Competition.start(competition);
                this.currentCompetition = competition;
                this.db.updateCompetition(competition);
                this.competitionState = new CompetitionState(competition);
                this.competitionState.init(this.db, () => {
                    this.competitionState.competitionStart();
                    success(competition);
                }, (err) => {
                    logger.error("initializing CompetitionState failed", {competitionState: competitionState, errorMsg: err});
                    error("Cannot start competition: initializing failed");
                });
            }
        }, error);
    }

    stopCurrentCompetition(success, error) {
        if (!this.isCompetitionRunning()) {
            error("No competition running...");
        } else if (this.isTaskRunning()) {
            error("Competition cannot be stopped while a task is running");
            // TODO also check if there are pending judgements...??
        } else {
            var competition = this.currentCompetition;
            Competition.stop(competition);
            this.db.updateCompetition(competition);
            this.currentCompetition = null;
            this.competitionState.competitionStop();
            this.competitionState = null;

            success();
        }
    }

    isTaskRunning() {
        return this.isCompetitionRunning() && this.currentCompetition.currentTaskId !== null;
    }

    currentTask(callback) {
        if (this.toleranceTask) {   // first check if we currently have a "toleranceTask"
            callback(this.toleranceTask);
        } else if (!this.isTaskRunning()) {
            callback(null);
        } else {
            this.db.findTask({_id: this.currentCompetition.currentTaskId}, callback, (err) => {
                logger.error("loading currently running task failed", err);
                callback(null);
            });
        }
    }

    getLatestTaskId() {
        if (this.competitionState) {
            var tasks = this.competitionState.tasks;
            if (tasks && tasks.length > 0) {
                return tasks[tasks.length-1]._id;
            }
        }
        return null;
    }

    setToleranceTask(task) {
        this.toleranceTask = task;
        logger.info("tolerance time: waiting for further submissions for " + config.task.KISTimeTolerance + " seconds");
        this.socket.sendToViewers("toleranceExtension", config.task.KISTimeTolerance);
        clearTimeout(this.toleranceTaskTimeout);    // there might be an timeout running already (in case of recursive time extension)
        this.toleranceTaskTimeout = setTimeout(() => {
            this.toleranceTask = null;
            logger.info("tolerance time is over.");
            this.socket.sendToViewers("toleranceTimeout", config.task.KISTimeTolerance);
        }, config.task.KISTimeTolerance * 1000);
    }

    // tries to start a task with given id
    // in case of success, success callback is called and delivers the Task object
    // otherwise, error callback is called with an error message
    startTask(taskId, success, error) {
        error = optional(error);
        this.db.findTask({_id: taskId}, (task) => {
            if (!task) {
                error("No task found with id " + taskId);
            } else if (!this.isCompetitionRunning()) {
                error("No competition is currently running.");
            } else if (task.competitionId !== this.currentCompetition._id) {
                error("This task does not belong to the current competition.");
            } else if (this.currentCompetition.currentTaskId) {
                error("Another task is currently running.");
            } else if (task.running || task.finished) {
                error("This task has already been started.");
            } else if (this.countdownInterval) {
                error("Another task is about to be started.");
            } else {
                // firstly, create "empty" TaskResults for each team at the beginning of a new task
                this.db.createTaskResults(this.currentCompetition._id, taskId, (taskResults) => {
                    if (!taskResults) {
                        error("Internal error (taskResult insert failed)");
                    } else {
                        this.submissionHandler.resetTask(); // reset the pool of correct shots (for AVS)

                        this.startCountdown().then(() => {
                            this.db.disableAutocompaction();
                            Task.start(task);
                            this.currentCompetition.currentTaskId = task._id;
                            this.currentCompetition.taskSequence.push(task._id);
                            this.db.updateTask(task);
                            this.db.updateCompetition(this.currentCompetition);

                            this.competitionState.taskStart(task, taskResults);

                            // set inverval for client timer updates
                            this.timerTick(task);
                            this.taskInterval = setInterval(() => {
                                this.timerTick(task);
                            }, 1000);

                            // set timeout that stops the task after maxSearchTime
                            this.taskTimeout = setTimeout(() => {
                                this.stopCurrentTask();
                            }, task.maxSearchTime * 1000);

                            success(task);
                        });
                    }
                }, (errorMsg) => {
                    error("Starting task failed: " + errorMsg);
                });
            }
        }, error);
    }

    startCountdown() {
        return new Promise((resolve, reject) => {
            var timeToStart = config.task.countdownTime;    // in seconds!
            if (timeToStart <= 0) {
                resolve();
            } else {
                this.socket.sendToViewers("countdown", timeToStart);
                this.countdownInterval = setInterval(() => {
                    timeToStart--;
                    if (timeToStart > 0) {
                        this.socket.sendToViewers("countdown", timeToStart);
                    } else {
                        clearInterval(this.countdownInterval);
                        this.countdownInterval = null;
                        resolve();
                    }
                }, 1000);
            }
        });
    }

    // task is finished for one of the following reasons
    // 1. time up
    // 2. all teams submitted a correct answer (only for KIS tasks)
    // 3. manual stop
    stopCurrentTask(success, error) {
        success = optional(success);
        error = optional(error);
        if (!this.isTaskRunning()) {
            error("No task running.");
        } else {
            clearTimeout(this.taskTimeout); // task could have been stopped before max search time is over
            clearInterval(this.taskInterval);   // also stop remaining time interval
            this.db.findTask({_id: this.currentCompetition.currentTaskId}, (task) => {
                if (!task) {
                    logger.error("task could not be stopped!", {taskId: this.currentCompetition.currentTaskId});
                    error("Internal server error.");
                } else {
                    Task.stop(task);
                    this.currentCompetition.currentTaskId = null;
                    this.db.updateTask(task);
                    this.db.updateCompetition(this.currentCompetition);

                    this.competitionState.taskStop(task);

                    // when the task is finished, re-enable datafile autocompaction (but wait a few seconds)
                    setTimeout(() => {
                        this.db.enableAutocompaction();
                    }, 10000);

                    success();
                }
            }, error);
        }
    }

    // TODO check database for consistency
    // (e.g., not multiple competitions or tasks running etc.)
    checkConsistency() {

    }

}



var instance = null;
var getInstance = function () {
    if (instance === null) {
        instance = new Controller();
    }
    return instance;
}

module.exports = getInstance();  // singleton object, same for all modules
