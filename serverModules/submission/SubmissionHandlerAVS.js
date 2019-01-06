var async = require('async'),
        controller = require('../Controller'),
        LiveJudging = require('./LiveJudging'),
        Video = require('../entities/Video'),
        config = require('../../config.json'),
        logger = require('winston');

class SubmissionHandlerAVS {

    constructor(submissionHandler) {
        this.submissionHandler = submissionHandler;
        this.db = submissionHandler.db;

        this.liveJudging = new LiveJudging(this); // pool of live judges

        // pool of all correctly found shots of the current AVS task
        // format: correctPool[videoNumber][shotNumber] = rangeId
        this.correctPool = {};
        this.numRanges = 0; // number of correctly found ranges
    }

    resetTask() {
        // reset pool of correct shots
        this.correctPool = {};
        this.numRanges = 0;
        // also clear list of potentially open judgements which could interfere!
        this.liveJudging.clearQueue();
    }

    // refreshes the correctPool (needed to reconstruct the server state after crash)
    // and re-assignes unjudged submissions
    reconstruct(competitionState) {
        if (competitionState &&
                competitionState.activeTaskIdx >= 0
                && competitionState.activeTaskIdx < competitionState.tasks.length) {
            var task = competitionState.tasks[competitionState.activeTaskIdx];
            if (task && task.type.startsWith("AVS")) {
                this.correctPool = {};
                for (var teamId in competitionState.submissions) {
                    for (var submissionId in competitionState.submissions[teamId]) {
                        var submission = competitionState.submissions[teamId][submissionId];
                        if (!submission.judged) {
                            this.liveJudging.requestJudgement(task, submission, this.judgementReceived.bind(this, task, submission));
                        } else if (submission.correct) {
                            this.extendCorrectPool(submission);
                        }
                    }
                }
                controller.competitionState.updateAVSStatistics(this.getNumVideos(), this.numRanges);
            }
        }
    }

    getNumVideos() {
        return Object.values(this.correctPool).length;
    }

    handleSubmission(submission, task, res) {

        // update competition info and notify clients about new submission
        // for AVS, we don't want to wait until we got a judgement...
        controller.competitionState.addSubmission(submission);

        // judgement of AVS tasks has to be asynchronous,
        // because we might need a live judgement (if not found in ground truth)
        // means that the callback might possibly be executed seconds or even minutes later (!)
        this.liveJudging.requestJudgement(task, submission, this.judgementReceived.bind(this, task, submission));

        // we do not known how long the judgement process will take
        // (potentially several minutes in case of many submissions and few judges)
        // so we cannot keep all the connections open -> send response immediately
        res.send("Submission is being assessed...");
    }

    judgementReceived(task, submission) {
        if (!submission.judged) {
            logger.error("WTF?? Judge returned unjudged submission ???", submission);
            // request again
            this.liveJudging.requestJudgement(task, submission, this.judgementReceived.bind(this, task, submission));
        } else {
            logger.info("submission is " + ((submission.correct) ? "correct" : "wrong"), {submissionId: submission._id, teamNumber: submission.teamNumber});
            // update competitionState and notify clients about judgement
            controller.competitionState.updateSubmission(submission);
            // enter critical section
            // otherwise handling of concurrent submissions could interleave and lead to inconsistencies
            //  (due to asynchronous database access)
            this.submissionHandler.criticalSection(this.updateResults.bind(this, submission, task));
        }
    }

    // note: the update is not executed upon submission, but upon judgement!
    // moreover, this method is managed by an async queue to ensure consistency
    // this means, that finished() must be called in any case (otherwise other update calls wait forever)
    updateResults(submission, task, finished) {
        this.db.findTaskResultForSubmission(submission, (taskResult) => {
            if (!taskResult) {
                // should not happen... ???
                logger.error("missing TaskResult", {taskId: submission.taskId, teamId: submission.teamId});
                finished();
            } else {
                // now that submission is judged, update it
                this.db.updateSubmission(submission, () => {
                    taskResult.numAttempts++;
                    var isNewCorrectShot = false;
                    if (submission.correct) {
                        taskResult.numCorrect++;
                        taskResult.searchTimes.push(submission.searchTime);
                        // numRanges and taskScore is computed later
                        isNewCorrectShot = this.extendCorrectPool(submission);
                    } else {
                        taskResult.numWrong++;
                    }

                    // taskResult is replaced in db (no problem, because async.queue guarantees that we have no concurrency)
                    // until now, only numAttempts/Correct/Wrong and search times have been modified
                    // score and numRanges are computed after the taskResult is updated with this information
                    this.db.updateTaskResult(taskResult, () => {
                        if (isNewCorrectShot) {
                            // score of ALL teams has to be updated with each newly found correct shot (because recall changes)
                            this.updateScores(task, () => {
                                controller.competitionState.updateScores();
                                controller.competitionState.updateAVSStatistics(this.getNumVideos(), this.numRanges);
                                finished();
                            });
                        } else {
                            // if the correct submission contains a shot that has already been found by another team,
                            //      only the score of the corresponding team has to be updated (because recall for other teams can't change)
                            // the score of the corresponding team also has to be updated with a negative judgement (because precision decreases)
                            this.updateTeamScore(task, submission.teamId, submission.correct, () => {
                                controller.competitionState.updateScores();
                                finished();
                            });
                        }
                    }, (err) => {
                        logger.error("updating task result failed", {taskResult: taskResult, errorMsg: err});
                        finished();
                    });
                }, (err) => {
                    logger.error("Error updating submission", {errorMsg: err, submission: submission});
                    finished();
                });
            }
        }, (err) => {
            logger.error("Error finding TaskResult", {errorMsg: err, taskId: submission.taskId, teamId: submission.teamId});
            finished();
        });
    }

    // For AVS tasks, scores can change after every submission, because the search continues...
    // even a wrong submission can change the score (but only for the respective team)
    // also the score of other teams can change! (because pool for recall changes)
    // TODO consider submission confidences
    updateScores(task, finished) {
        this.db.findTeams({competitionId: task.competitionId}, (teams) => {
            async.each(teams, (team, finished2) => {
                this.updateTeamScore(task, team._id, true, finished2);
            }, function (err) {
                if (err) {
                    logger.error("updating team scores failed", {task: task, errorMsg: err});
                    finished();
                } else {
                    // all teams were updated
                    finished();
                }
            });
        }, (err) => {
            logger.error("loading teams failed", {task: task, errorMsg: err});
            finished();
        });
    }

    updateTeamScore(task, teamId, submissionCorrect, finished) {

        var query = {competitionId: task.competitionId, taskId: task._id, teamId: teamId};
        this.db.findTaskResult(query, (taskResult) => {
            new Promise((resolve, reject) => {
                if (submissionCorrect) {    // only need to refresh numRanges if submission was correct
                    var query = {competitionId: task.competitionId, taskId: task._id, teamId: teamId, judged: {$ne: null}, correct: true};
                    this.db.findSubmissions(query, (submissions) => {

                        var videoIds = new Set();
                        var rangeIds = new Set();
                        for (var i = 0; i < submissions.length; i++) {
                            var s = submissions[i];
                            if (this.correctPool[s.videoNumber] && this.correctPool[s.videoNumber][s.shotNumber]) {
                                videoIds.add(s.videoNumber);
                                rangeIds.add(this.correctPool[s.videoNumber][s.shotNumber]);
                            }
                        }

                        taskResult.numVideos = videoIds.size;   // just for info at client
                        taskResult.numRanges = rangeIds.size;
                        resolve();
                    }, (err) => {
                        logger.error("loading submissions failed", {task: task, teamId: teamId, errorMsg: err});
                        finished();
                    });
                } else {
                    resolve();
                }
            }).then(() => {
                if (taskResult.numRanges > 0) {
                    var scoreRecall = taskResult.numRanges / this.numRanges;
                    var scorePrecision = taskResult.numCorrect / (taskResult.numCorrect + taskResult.numWrong / 2);
                    taskResult.taskScore = parseFloat((scorePrecision * scoreRecall * 100).toFixed(2));
                } else {
                    taskResult.taskScore = 0;
                }

                controller.competitionState.updateTaskResult(taskResult);

                // taskResult is replaced in db (no problem, because avsUpdateQueue guarantees that we have no concurrency)
                this.db.updateTaskResult(taskResult, finished, (err) => {
                    logger.error("updating task result failed", {taskResult: taskResult, errorMsg: err});
                    finished();
                });
            });
        }, (err) => {
            logger.error("loading task result failed", {task: task, teamId: teamId, errorMsg: err});
            finished();
        });
    }

    // returns true if the pool was extended
    // returns false if this shot already was in the pool before
    extendCorrectPool(submission) {
        if (submission && submission.judged && submission.correct) {
            if (!this.correctPool[submission.videoNumber]) {
                this.correctPool[submission.videoNumber] = {};
            }
            if (!this.correctPool[submission.videoNumber][submission.shotNumber]) {
                // this is a new shot that has not been found before
                this.correctPool[submission.videoNumber][submission.shotNumber] = -1;
                // update the shot quantization for this video
                this.updateShotQuantization(submission.videoNumber);
                return true;
            }
        }
        return false;
    }

    // updates the ranges of this.correctPool
    // ranges are stored as value of correctPool[videoNumber][shotNumber] in the format videoNumber_rid
    updateShotQuantization(videoNumber) {
        var video = controller.videoMap[videoNumber];
        var nextId = 1;
        // array of correctly found shotNumbers of this video (sorted asc)
        var correctShots = Object.keys(this.correctPool[videoNumber]).map((s) => parseInt(s)).sort((a, b) => a - b);
        if (correctShots.length > 0) {
            var rangeStart = Video.getShotBoundaries(correctShots[0], video).startTime;
            for (var i = 0; i < correctShots.length; i++) {
                var shotNumber = correctShots[i];
                var shotBoundaries = Video.getShotBoundaries(shotNumber, video);
                if (rangeStart + config.task.AVSRangeDuration < shotBoundaries.startTime) {
                    rangeStart = shotBoundaries.startTime;
                    nextId++;
                }
                this.correctPool[videoNumber][shotNumber] = videoNumber + "_" + nextId;
            }
            // update this.numRanges
            var rangeSet = new Set();
            for (videoNumber in this.correctPool) {
                for (shotNumber in this.correctPool[videoNumber]) {
                    rangeSet.add(this.correctPool[videoNumber][shotNumber]);
                }
            }
            this.numRanges = rangeSet.size;
        }
    }
}

module.exports = SubmissionHandlerAVS;
