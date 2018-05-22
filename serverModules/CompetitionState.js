var async = require('async'),
        Utils = require('./Utils'),
        controller = require('./Controller');

/* summarizes the entire state of a competition (executed tasks, results etc.)
 * this object is exchanged between server and clients
 * it is held in memory by the controller, but is not persisted in the database in this form, 
 * as it can be completely reconstructed from the database (which is done in case of a server crash)
 * it is also used as data format for inspection of finished Competitions
 */

class CompetitionState {

    constructor(competition) {

        // information about the competition
        this.competitionId = competition._id;
        this.name = competition.name;
        this.running = competition.running;
        this.finished = competition.finished;
        this.startTimeStamp = competition.startTimeStamp;
        this.endTimeStamp = competition.endTimeStamp;

        // array of Tasks that have been executed in the competition
        //  (further tasks that have not been started (yet) are NOT included)
        // sorted chronologically and including current task (respectively latest)
        this.tasks = new Array();

        // the "active task" is the one that is currently "selected" or "visualized" by the client
        // this does not mean that is is necessarily running
        // it may also be any of the already executed tasks (for inspection)
        // activeTaskIdx holds the index of this Task in this.tasks
        this.activeTaskIdx = -1;

        // central element summarizing the results of the competition
        // structure: associative array mapping teamId (not teamNumber!) to an object 
        //  in the form {team, taskResults, subScores, overallScores}, where
        //      team = Team object with name, color, logo etc. (does not change)
        //      taskResults = list of TaskResult objects (absolute task score, attempts etc.), in task sequence order (has the same length as tasks)
        //      subScores = associative array mapping taskType to an array of floats representing the progression of sub scores, max normalized, only considering tasks of the respective taskType!
        //      overallScores = array of floats representing the progression of overall scores, in task sequence order and for all executed tasks (has the same length as tasks)
        this.results = {};
        // example:
        //        this.results[teamId] = {
        //            team: team,
        //            taskResults: taskResultList,    
        //            subScores: {
        //                taskType: subScores
        //                ...
        //            },
        //            overallScores: overallScores
        //         }

        // list of all submissions for activeTask
        // associative array with key teamId mapping to a 
        // seconds associative array with key submissionId
        //  (this makes it easier to update a submission, if chronological order is needed, simple sort() can be used)
        this.submissions = {};

        // statistics about AVS tasks (meaningless if the active task is a KIS task)
        this.avsStatistics = {
            submissions: 0, // number of total submissions for this task
            unjudged: 0, // number of submissions that are not judged yet
            videos: 0, // number of distinct videos that were found
            ranges: 0 // number of distinct ranges that were found
        };
    }

    // initialize this.results with Team objects and empty lists
    init(db, callback, error) {
        db.findTeams({competitionId: this.competitionId}, (teams) => {
            for (var i = 0; i < teams.length; i++) {
                var team = teams[i];
                this.results[team._id] = {
                    team: team,
                    taskResults: new Array(),
                    subScores: {}, // lists for taskTypes are created when the first instance of such task is started
                    overallScores: new Array()
                };
                this.submissions[team._id] = {};
            }
            callback();
        }, error);
    }

//    debug() {
//        var tmp = {};
//        for (var teamId in this.results) {
//            tmp[teamId] = {};
//            tmp[teamId].subScores = this.results[teamId].subScores;
//            tmp[teamId].overallScores = this.results[teamId].overallScores;
//        }
//        console.log(JSON.stringify(tmp, null, 2));
//        console.log(JSON.stringify(this.submissions, null, 2));
//    }

    // the following update methods always assume that the currently active task is concerned
    addSubmission(submission) {
        this.submissions[submission.teamId][submission._id] = submission;
        if (this.tasks[this.activeTaskIdx]
                && this.tasks[this.activeTaskIdx].type.startsWith("AVS")) {
            this.avsStatistics.submissions++;
            // addSubmission is called before judgement
            // (after judgement, updateSubmission() is called)
            this.avsStatistics.unjudged++;
        }
        controller.socket.sendToViewers("newSubmission", submission);
        controller.socket.sendToViewers("updateAVSStatistics", this.avsStatistics);
    }

    // is called in case of AVS tasks when the judgement arrives
    //  (but before the new score is computed)
    updateSubmission(submission) {
        this.submissions[submission.teamId][submission._id] = submission;
        if (this.tasks[this.activeTaskIdx]
                && this.tasks[this.activeTaskIdx].type.startsWith("AVS")) {
            this.avsStatistics.unjudged--;
            // number of videos and ranges cannot be updated here, 
            // because they are computed later in the critical section
        }
        controller.socket.sendToViewers("newJudgement", submission);
        controller.socket.sendToViewers("updateAVSStatistics", this.avsStatistics);
    }

    // when the critical section is over, number of videos and ranges can be updated
    updateAVSStatistics(numVideos, numRanges) {
        this.avsStatistics.videos = numVideos;
        this.avsStatistics.ranges = numRanges;
        controller.socket.sendToViewers("updateAVSStatistics", this.avsStatistics);
    }

    resetSubmissions() {
        for (var teamId in this.submissions) {
            this.submissions[teamId] = {};
        }
        this.avsStatistics = {
            submissions: 0,
            unjudged: 0,
            videos: 0,
            ranges: 0
        };
    }

    updateTaskResult(taskResult) {
        this.results[taskResult.teamId].taskResults[this.activeTaskIdx] = taskResult;
    }

    updateScores() {
        this.updateAggregateScores();
        // send updates scores and results to viewers
        controller.socket.sendToViewers("scoreUpdate", this.results);
    }

    // updates the aggregate scores at the specified position in the task sequence
    // if no taskIdx is passed, the latest task is considered by default
	// TODO do we even need this parameter?
    // requires that all corresponding TaskResults are up to date
    // 1. update sub score for respective task type
    //      - compute absolute total score for all teams for this type
    //      - max normalize
    // 2. update overall score
    //      - average of all existing subscores
    updateAggregateScores(taskIdx) {
        if (!Utils.isDefined(taskIdx)) {
            taskIdx = this.tasks.length - 1;
        }
        if (taskIdx <= this.tasks.length) {
            var taskType = this.tasks[taskIdx].type;

            // 1. update sub scores
            this.ensureSubScore(taskType);   // if this is the first task of its type, a new subscore has to be initialized    
            var subScoreIdx = this.getSubScoreIndex(taskIdx);

            var absSubScores = {};
            var maxSubScore = 0;
            for (var teamId in this.results) {
                var absTeamSubScore = 0;
                var taskResults = this.results[teamId].taskResults;
                for (var i = 0; i < taskResults.length && i <= taskIdx; i++) {
                    if (this.tasks[i].type == taskType) {
                        absTeamSubScore += taskResults[i].taskScore;
                    }
                }
                absSubScores[teamId] = absTeamSubScore;
                maxSubScore = Math.max(absTeamSubScore, maxSubScore);
            }

            for (var teamId in this.results) {
                var subScores = this.results[teamId].subScores[taskType];
                if (maxSubScore == 0) {
                    subScores[subScoreIdx] = 0;
                } else {
                    subScores[subScoreIdx] = parseFloat(100 * absSubScores[teamId] / maxSubScore);
                }
            }

            // 2. overall score
            for (var teamId in this.results) {
                var sum = 0;
                var numTypes = 0;
                for (var type in this.results[teamId].subScores) {
                    var typeSubScores = this.results[teamId].subScores[type];
                    sum += parseFloat(typeSubScores[typeSubScores.length - 1]);	// TODO only working for last task!
                    numTypes++;
                }
                this.results[teamId].overallScores[taskIdx] = sum / numTypes;
            }
        }
    }

    ensureSubScore(taskType) {
        var teamId = Object.keys(this.results)[0];  // just check for one team. we can assume it is the same for all teams
        if (!this.results[teamId].subScores[taskType]) {
            // this is the first task of this type
            //  -> create a new subscore list
            for (var teamId in this.results) {
                this.results[teamId].subScores[taskType] = [];
            }
        }
    }

    // returns the index of this task wrt. its type
    getSubScoreIndex(taskIdx) {
        var taskType = this.tasks[taskIdx].type;
        var subScoreIdx = -1;
        for (var i = 0; i <= taskIdx; i++) {
            if (this.tasks[i].type == taskType) {
                subScoreIdx++;
            }
        }
        return subScoreIdx;
    }

    // build entire object from database
    // necessary (1) if the server crashes and has to be restarted,
    // or (2) for later inspection of a finished competition
    // or (3) if a task is reset
    static reconstructFromDatabase(competition, db, reconstructionSuccess, reconstructionError) {

        var competitionState = new CompetitionState(competition);
        // initialize teams and empty arrays
        competitionState.init(db, () => {
            // follow the recorded task sequence (strict sequence -> not parallel!)
            async.eachSeries(competition.taskSequence, (taskId, taskFinished) => {
                competitionState.reconstructTask(taskId, db, taskFinished);
            }, (err) => {
                if (err) {  // if err is set it means that (at least) one Task could not be reconstructed
                    reconstructionError(err);
                } else {
                    // // the latest task is the active one by default
                    competitionState.activeTaskIdx = competition.taskSequence.length - 1;
                    if (competitionState.activeTaskIdx < 0) {
                        // no task started yet...
                        reconstructionSuccess(competitionState);
                    } else {
                        // load all submissions of active task (per team)
                        var taskId = competitionState.tasks[competitionState.activeTaskIdx]._id;
                        async.each(Object.keys(competitionState.results), (teamId, subFinished) => {
                            db.findSubmissions({competitionId: competition._id, teamId: teamId, taskId: taskId}, (submissions) => {
                                for (var i = 0; i < submissions.length; i++) {
                                    competitionState.submissions[teamId][submissions[i]._id] = submissions[i];
                                    competitionState.avsStatistics.submissions++;
                                    if (!submissions[i].judged) {
                                        competitionState.avsStatistics.unjudged++;
                                    }
                                }
                                subFinished();
                            }, (err) => {
                                subFinished("loading submissions failed: " + err)
                            });
                        }, (err) => {
                            if (err) {
                                reconstructionError(err);
                            } else {
//                                competitionState.debug();
                                reconstructionSuccess(competitionState);
                            }
                        });
                    }
                }
            });
        }, reconstructionError);
    }

    taskStart(task, taskResults) {
        this.tasks.push(task);
        this.activeTaskIdx = this.tasks.length - 1;
        this.resetSubmissions();
        for (var i = 0; i < taskResults.length; i++) {
            var tr = taskResults[i];
            var teamResults = this.results[tr.teamId];
            teamResults.taskResults.push(tr);

            if (!teamResults.subScores.hasOwnProperty(task.type)) {
                // this is the first task of this type
                teamResults.subScores[task.type] = new Array();
                teamResults.subScores[task.type].push(0);   // start with 0 points
            } else {
                var subScores = teamResults.subScores[task.type];
                var currentSubScore = subScores[subScores.length - 1];    // subScore after the previous task
                subScores.push(currentSubScore);    // when the task starts, the subScore (for now) stays the same as after the previous task
            }

            var overallScores = teamResults.overallScores;
            var currentOverallScore = 0;
            if (overallScores.length > 0) {
                currentOverallScore = overallScores[overallScores.length - 1];
            }
            teamResults.overallScores.push(currentOverallScore);    // also the overall score remains the same (as after the previous task)            
        }
        controller.socket.sendToViewers("startTask", task);
        controller.socket.sendToViewers("scoreUpdate", this.results);
    }

    taskStop(task) {
        // replace the old task object by the updated version (finished:true, endTimestamp, etc.)
        // assumes that the stopped task can only be the last in the list...
        this.tasks[this.tasks.length - 1] = task;
        controller.socket.sendToViewers("stopTask", task);
    }

    competitionStart() {
        controller.socket.sendToViewers("startCompetition", this);
    }

    competitionStop() {
        controller.socket.sendToViewers("stopCompetition");
    }

    reconstructTask(taskId, db, taskCallback) {  // if an argument is passed to callback, it is considered an error
        db.findTask({competitionId: this.competitionId, _id: taskId}, (task) => {
            if (!task) {
                taskCallback("task from taskSequence not found: " + taskId);
                return;
            } else {
                this.tasks.push(task);
                // add all taskResults for this task
                async.each(this.results, (result, teamCallback) => {    // iterate over teams (can be done in parallel)
                    var team = result.team;
                    var query = {competitionId: this.competitionId, taskId: task._id, teamId: team._id};
                    db.findTaskResult(query, (taskResult) => {
                        result.taskResults.push(taskResult);
                        teamCallback();
                    }, (err) => {
                        teamCallback("taskResult not found: " + err);
                    });
                }, (err) => {
                    if (err) { // if err is set it means that (at least) one Team could not be reconstructed
                        taskCallback("team not reconstructed: " + err);
                    } else {
                        // update all scores for this position in the task sequence (currently the latest)
                        this.updateAggregateScores();
                        taskCallback();
                    }
                });
            }
        }, (err) => {
            taskCallback("task not found: " + err);
        });
    }

}

module.exports = CompetitionState;

