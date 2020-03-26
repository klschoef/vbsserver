var Utils = require('../Utils.js'),
        controller = require('../Controller'),
        config = require('../../config.json'),
        logger = require('winston');

class SubmissionHandlerKIS {

    constructor(submissionHandler) {
        this.submissionHandler = submissionHandler;
        this.db = submissionHandler.db;
    }

    handleSubmission(submission, task) {
        // check if submission is correct
        this.judge(submission, task);
        logger.info("submission is " + ((submission.correct) ? "correct" : "wrong"), {submissionId: submission._id, teamNumber: submission.teamNumber});

        // enter critical section
        // otherwise handling of concurrent submissions could interleave and (although rather theoretically) lead to inconsistencies
        //  (due to asynchronous database access)
        this.submissionHandler.criticalSection(this.updateResults.bind(this, submission, task));
    }

    // due to asynchronous database access, calls to this method could interleave and produce inconsistencies
    // therefore, it is "locked" for parallel execution with async.queue
    // this means, that finished() must be called in any case (otherwise other update calls wait forever)
    updateResults(submission, task, finished) {
        this.db.findTaskResultForSubmission(submission, (taskResult) => {
            if (!taskResult) {
                // should not happen... ???
                logger.error("missing TaskResult", {taskId: submission.taskId, teamId: submission.teamId});
                finished();
                // submission remains in db (but with judged=null)
            } else if (taskResult.numCorrect > 0) { // check if team already has finished with a correct submission
                logger.info("Team already finished running task", {teamNumber: submission.teamNumber});
                finished();
                // submission remains in db (but with judged=null)
            } else {

                logger.info("Updating score for team", submission);
                // update competition info and notify clients about new submission
                //  (must be done after judgement and check if team finished for KIS tasks)
                controller.competitionState.addSubmission(submission);

                this.db.updateSubmission(submission, () => {
                    taskResult.numAttempts++;
                    if (submission.correct) {
                        // ensure "minimal time difference guarantee"
                        // TODO: in an extremely unlucky case, it could be possible that (due to async calls)
                        // meanwhile the task was stopped and another submission arrived and got rejected...
                        if (submission.searchTime + config.task.KISTimeTolerance > task.maxSearchTime) {
                            controller.setToleranceTask(task);
                        }
                        taskResult.numCorrect = 1;
                        taskResult.numVideos = 1;
                        taskResult.numRanges = 1; // for KIS tasks, only one correct range is available...  
                        taskResult.searchTimes.push(submission.searchTime);
                        taskResult.taskScore = this.computeScore(submission.searchTime, task.maxSearchTime, taskResult.numWrong);
                    } else {
                        taskResult.numWrong++;
                        // taskScore cannot change (simply remains 0, until the first (and only) correct submission)
                    }

                    // update competitionState (and notify client about new scores)
                    controller.competitionState.updateTaskResult(taskResult);
                    controller.competitionState.updateScores();

                    // taskResult is replaced in db (no problem, because async.queue guarantees that we have no concurrency)
                    this.db.updateTaskResult(taskResult, () => {
                        // check if all teams have succeeded. if so, then stop the task
                        this.db.haveAllTeamsSucceeded(task, () => {
                            logger.info("All teams have succeeded! Task can be stopped", {taskName: task.name});
                            controller.stopCurrentTask();
                        });
                        finished();
                    }, (err) => {
                        logger.error("updating task result failed", {taskResult: taskResult, errorMsg: err});
                        finished();
                    });
                }, (err) => {
                    logger.error("Updating submission failed", {taskId: submission.taskId, teamId: submission.teamId, errorMsg: err});
                    finished();
                });
            }
        }, (err) => {
            logger.error("Error finding TaskResult", {errorMsg: err, taskId: submission.taskId, teamId: submission.teamId});
            finished();
        });
    }

    judge(submission, task) {
        for (var i = 0; i < task.videoRanges.length; i++) {
            if (Utils.matches(submission, task.videoRanges[i])) {
                submission.judged = "kis";
                submission.correct = true;
                return;
            }
        }
        submission.judged = "kis";
        submission.correct = false;
    }

    computeScore(searchTime, maxSearchTime, numWrong) {
        // no max numAttempts (is implicitly limited by subtractive penalty)
        var timeFactor = (maxSearchTime - searchTime) / maxSearchTime;
        var variablePart = (100 - config.task.KISMinScore) * timeFactor;
        var baseScore = config.task.KISMinScore + variablePart;
        var penalty = numWrong * config.task.KISPenalty;    // subtractive penalty

        var score = Math.min(100, Math.max(0, Math.round(baseScore - penalty)));    // score must be max 100 and not negative (due to penalty)
        return score;
    }

}


module.exports = SubmissionHandlerKIS;
