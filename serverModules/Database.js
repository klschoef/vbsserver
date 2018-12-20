var Datastore = require('nedb'),
        User = require('./entities/User'),
        Competition = require('./entities/Competition'),
        Team = require('./entities/Team'),
        Task = require('./entities/Task'),
        TaskResult = require('./entities/TaskResult'),
        Submission = require('./entities/Submission'),
        logger = require('winston'),
        validate = require("validate.js"),
        ValidationConstraints = require('./ValidationConstraints');

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

class Database {
    constructor() {
        this.db = {}; // database object containing the various collections
    }

    init() {
        logger.info("initializing database...");
        return new Promise((resolve, reject) => {
            var promises = [];
            promises.push(this.loadDatastore("users", "./database/users.db"));
            promises.push(this.loadDatastore("competitions", "./database/competitions.db"));
            promises.push(this.loadDatastore("teams", "./database/teams.db"));
            promises.push(this.loadDatastore("tasks", "./database/tasks.db"));
            promises.push(this.loadDatastore("taskResults", "./database/taskResults.db"));
            promises.push(this.loadDatastore("submissions", "./database/submissions.db"));
            promises.push(this.loadDatastore("videos", "./database/videos.db"));
            promises.push(this.loadDatastore("groundTruth", "./database/groundTruth.db"));  // note: ground truth is shared over competitions (unique key: trecvidId)
            promises.push(this.loadDatastore("actionLogs", "./database/actionLogs.db"));

            Promise.all(promises).then(() => {
                logger.info("Database loaded...");
                this.db.users.ensureIndex({fieldName: 'username', unique: true}, function (err) {});
                this.db.videos.ensureIndex({fieldName: 'videoNumber', unique: true}, function (err) {});

                // add custom validators
                // db is also needed (e.g., for uniqueness constraints)
                ValidationConstraints.addCustomValidators(validate);

                // datafiles are compacted every 30 seconds
                this.enableAutocompaction();

                resolve();
            }, () => {
                logger.error("loading database failed");
                reject();
            });
        });
    }

    enableAutocompaction() {
        logger.info("database autocompaction enabled");
        for (var datastoreName in this.db) {
            this.db[datastoreName].persistence.setAutocompactionInterval(30000);   // compact datafile every 30 seconds
        }
    }

    disableAutocompaction() {
        logger.info("database autocompaction disabled");
        for (var datastoreName in this.db) {
            this.db[datastoreName].persistence.stopAutocompaction();   // during tasks, we disable autocompaction
        }
    }

    loadDatastore(target, filename) {
        return new Promise((resolve, reject) => {
            this.db[target] = new Datastore({filename: filename, autoload: true, onload: resolve});
            this.db[target].name = target;  // assign a "name" field to the Datastores (for logging)
        });
    }

    /*
     * TODO little bit of documentation
     * unified format for db operations (collection, data, success, error)
     *
     */


    validation(data, constraints, success, error) {
        validate.async(data, constraints, {format: "flat", fullMessages: false}).then(success, error);
    }

//////////////////////////
//  Create Entities     //
//////////////////////////

    // inserts the given entity to the given collection
    // and returns the new document (including _id) via callback
    // in case of an error, the callback returns null
    createEntity(collection, data, constraints, success, error) {
        success = optional(success);
        error = optional(error);
        this.validation(data, constraints, () => {
            collection.insert(data, (err, newDoc) => {
                if (err) {
                    logger.error("creating entity failed", {entity: data, error: err, collection: collection.name});
                    error(err);
                } else {
                    logger.verbose("created new entity", {entity: newDoc, collection: collection.name});
                    success(newDoc);
                }
            });
        }, (validationErrors) => {
            error(JSON.stringify(validationErrors));
        });
    }

    // same as above, but with an array of entities
    createEntities(collection, data, constraints, success, error) {
        this.createEntity(collection, data, constraints, success, error);
    }

    createUser(data, success, error) {
        this.createEntity(
                this.db.users,
                new User(data),
                ValidationConstraints.USER,
                success,
                error);
    }

    createCompetition(data, success, error) {
        this.createEntity(
                this.db.competitions,
                new Competition(data),
                ValidationConstraints.COMPETITION,
                success,
                error);
    }

    createTeam(data, success, error) {
        this.createEntity(
                this.db.teams,
                new Team(data),
                ValidationConstraints.TEAM,
                success,
                error);
    }

    // query has the following format (depending on the task type):
    // { type, videoRanges, textList, trecvidId, avsText, imageList}
    createTask(data, success, error) {
        this.createEntity(
                this.db.tasks,
                new Task(data),
                ValidationConstraints.TASK,
                success,
                error);
    }

    createTaskResult(data, success, error) {
        this.createEntity(
                this.db.taskResults,
                new TaskResult(data),
                ValidationConstraints.TASKRESULT,
                success,
                error);
    }

    // creates "empty" taskResults for all teams for the given task
    createTaskResults(competitionId, taskId, success, error) {
        error = optional(error);
        // first, verify that no such TaskResults already exist
        var query = {competitionId: competitionId, taskId: taskId};
        this.exists(this.db.taskResults, query, () => {
            error("Database inconsistency: TaskResults already exist for this task");
        }, () => {
            this.findTeams({competitionId: competitionId}, (teams) => {
                var taskResults = new Array();
                for (var i = 0; i < teams.length; i++) {
                    taskResults.push(new TaskResult({
                        competitionId: competitionId,
                        teamId: teams[i]._id,
                        taskId: taskId}));
                }
                this.createEntities(this.db.taskResults, taskResults, {}, success, error);
            });
        }, (err) => {
            error(err);
        });
    }

    createSubmission(data, success, error) {
        this.createEntity(
                this.db.submissions,
                new Submission(data),
                ValidationConstraints.SUBMISSION,
                success,
                error);
    }

    createActionLogEntry(data, success, error) {
        this.createEntity(
              this.db.actionLogs,
              data,
              {},   // TODO validator for log format
              success,
              error);
    }

/////////////////////////////
//  Find/Load Entities     //
/////////////////////////////



// searches for entities matching the given query
// and returns them via callback
// in case of an error, the error callback returns an error message
// this is also the case if only one result is allowed
    findEntity(collection, query, success, error, allowMultiple) {
        error = optional(error);
        collection.find(query, (err, docs) => {
            if (err) {
                logger.error("finding entity failed", {query: query, errorMsg: err, collection: collection.name});
                error(err);
            } else if (allowMultiple) {
                success(docs); // return array
            } else if (docs.length === 0) {
                logger.verbose("nothing found", {query: query, collection: collection.name});
                success(null);
            } else if (docs.length > 1) {  // only one result allowed, but multiple found
                logger.warn("multiple entities found, although there should only be one...", {query: query, docs: docs, collection: collection.name});
                error("multiple entities found, although there should only be one...");
            } else {
                success(docs[0]); // return single "document"
            }
        });
    }

    // TODO dedicated method for credentials check
    findUser(query, success, error) {
        this.findEntity(this.db.users, query, (user) => {
            // password should not be returned
            user.password = "******";
            success(user);
        }, error, false);
    }

    findUsers(query, success, error) {
        this.findEntity(this.db.users, query, (users) => {
// password should not be returned
            users.forEach((user) => user.password = "******");
            success(users);
        }, error, true);
    }

    findCompetition(query, success, error) {
        this.findEntity(this.db.competitions, query, success, error, false);
    }

    findCompetitions(query, success, error) {
        this.findEntity(this.db.competitions, query, success, error, true);
    }

    findTeam(query, success, error) {
        this.findEntity(this.db.teams, query, success, error, false);
    }

    findTeams(query, success, error) {
        this.findEntity(this.db.teams, query, success, error, true);
    }

    findTask(query, success, error) {
        this.findEntity(this.db.tasks, query, success, error, false);
    }

    findTasks(query, success, error) {
        this.findEntity(this.db.tasks, query, success, error, true);
    }

    findTaskResult(query, success, error) {
        this.findEntity(this.db.taskResults, query, success, error, false);
    }

    findTaskResults(query, success, error) {
        this.findEntity(this.db.taskResults, query, success, error, true);
    }

    findTaskResultForSubmission(submission, success, error) {
        var query = {
            competitionId: submission.competitionId,
            taskId: submission.taskId,
            teamId: submission.teamId};
        this.findTaskResult(query, success, error);
    }

    findSubmission(query, success, error) {
        this.findEntity(this.db.submissions, query, success, error, false);
    }

    findSubmissions(query, success, error) {
        this.findEntity(this.db.submissions, query, success, error, true);
    }

    findVideo(query, success, error) {
        this.findEntity(this.db.videos, query, success, error, false);
    }

    findVideos(query, success, error) {
        this.findEntity(this.db.videos, query, success, error, true);
    }

//////////////////////////
//  Update Entities     //
//////////////////////////

    modifyEntity(collection, query, data, constraints, success, error) {
        success = optional(success);
        error = optional(error);
        this.validation(data, constraints, () => {
            collection.update(query, data, {}, (err, numReplaced) => {
                if (err) {
                    logger.error("updating entity failed", {entity: data, error: err, collection: collection.name});
                    error(err);
                } else if (numReplaced === 0) {
                    logger.warn("entity could not be updated", {entity: data, collection: collection.name});
                    error("entity could not be updated");
                } else {
                    logger.verbose("entity updated", {entity: data, collection: collection.name});
                    success();
                }
            });
        }, (validationErrors) => {
            error(JSON.stringify(validationErrors));
        });
    }

    // replaces the given object in the database (iff it already exists wrt. _id)
    replaceEntity(collection, data, constraints, success, error) {
        this.modifyEntity(collection, {_id: data._id}, data, constraints, success, error);
    }

    updateUser(user, success, error) {
        this.replaceEntity(this.db.users, user, ValidationConstraints.USER, success, error);
    }

    updateCompetition(competition, success, error) {
        this.replaceEntity(this.db.competitions, competition, ValidationConstraints.COMPETITION, success, error);
    }

    updateTeam(team, success, error) {
        this.replaceEntity(this.db.teams, team, ValidationConstraints.TEAM, success, error);
    }

    updateTask(task, success, error) {
        this.replaceEntity(this.db.tasks, task, ValidationConstraints.TASK, success, error);
    }

    updateTaskResult(taskResult, success, error) {
        this.replaceEntity(this.db.taskResults, taskResult, ValidationConstraints.TASKRESULT, success, error);
    }

    updateSubmission(submission, success, error) {
        this.replaceEntity(this.db.submissions, submission, ValidationConstraints.SUBMISSION, success, error);
    }

//////////////////////////
//  Delete Entities     //
//////////////////////////

    // deletes the given object in the database (iff it already exists wrt. _id)
    // if this object does not exist (and thus is not deleted), error callback is used
    deleteEntity(collection, data, success, error) {
        success = optional(success);
        error = optional(error);
        collection.remove({_id: data._id}, {}, (err, numRemoved) => {
            if (err) {
                logger.error("deleting entity failed", {entity: data, error: err, collection: collection.name});
                error(err);
            } else if (numRemoved === 0) {
                logger.warn("entity could not be deleted", {entity: data, collection: collection.name});
                error("entity could not be deleted");
            } else {
                logger.verbose("entity deleted", {entity: data, collection: collection.name});
                success();
            }
        });
    }

    // deletes multiple entities matching the query
    // if no item matches the query, we do not consider this an error
    deleteEntities(collection, query, success, error) {
        success = optional(success);
        error = optional(error);
        collection.remove(query, {multi: true}, (err, numRemoved) => {
            if (err) {
                logger.error("deleting entities failed", {query: query, error: err, collection: collection.name});
                error(err);
            } else if (numRemoved === 0) {
                logger.warn("no entity was deleted", {query: query, collection: collection.name});
                success(numRemoved);
            } else {
                logger.info(numRemoved + " entities deleted", {query: query, collection: collection.name});
                success(numRemoved);
            }
        });
    }

    deleteUser(user, success, error) {
        this.deleteEntity(this.db.users, user, success, error);
    }

    deleteCompetition(competition, success, error) {
        if (competition.running) {
            error("Competition is currently running and cannot be deleted.");
        } else {
            this.deleteEntity(this.db.competitions, competition, success, error);
            // TODO currently, deletion success is only considered for competition, not for cascading deletes...
            this.deleteTeams({competitionId: competition._id});
            this.deleteTasks({competitionId: competition._id});
            this.deleteTaskResults({competitionId: competition._id});
            this.deleteSubmissions({competitionId: competition._id});
        }
    }

    deleteTeam(team, success, error) {
        this.deleteEntity(this.db.teams, team, success, error);
    }

    deleteTask(task, success, error) {
        this.deleteEntity(this.db.tasks, task, success, error);
    }

    deleteTaskResult(taskResult, success, error) {
        this.deleteEntity(this.db.taskResults, taskResult, success, error);
    }

    deleteSubmission(submission, success, error) {
        this.deleteEntities(this.db.submissions, submission, success, error);
    }

    deleteTeams(query, success, error) {
        this.deleteEntities(this.db.teams, query, success, error);
    }

    deleteTasks(query, success, error) {
        this.deleteEntities(this.db.tasks, query, success, error);
    }

    deleteTaskResults(query, success, error) {
        this.deleteEntities(this.db.taskResults, query, success, error);
    }

    deleteSubmissions(query, success, error) {
        this.deleteEntities(this.db.submissions, query, success, error);
    }

/////////////////////////////////
//  Other special requests     //
/////////////////////////////////

    // callback parameters: (err, count)
    count(collection, query, success, error) {
        error = optional(error);
        collection.count(query, (err, count) => {
            if (err) {
                error(err);
            } else {
                success(count);
            }
        });
    }

    exists(collection, query, yes, no, error) {
        yes = optional(yes);
        no = optional(no);
        error = optional(error);
        this.count(collection, query, (count) => {
            (count > 0) ? yes() : no();
        }, error);
    }

    // checks if the given teamNumber is valid in the given competition
    // if yes, success callback returns the teams _id
    //  (required to assign the teams _id to submission objects)
    verifyTeamNumber(competitionId, teamNumber, success, error) {
        this.findTeam({competitionId: competitionId, teamNumber: teamNumber}, (team) => {
            if (team) {
                success(team._id);
            } else {
                error("Invalid team number");
            }
        }, (err) => {
            error("error: " + err);
        });
    }

    existsUser(username, yes, no, error) {
        this.exists(this.db.users, {username: username}, yes, no, error);
    }

    isDuplicateAVSSubmission(submission, yes, no, error) {
        var s = submission;
        var query = {competitionId: s.competitionId, teamNumber: s.teamNumber,
            taskId: s.taskId, videoNumber: s.videoNumber, shotNumber: s.shotNumber};
        this.exists(this.db.submissions, query, yes, no, error);
    }

    haveAllTeamsSucceeded(task, yes, no, error) {
        var query = {competitionId: task.competitionId, taskId: task._id, numCorrect: 0};
        this.exists(this.db.taskResults, query, no, yes, error);
    }

    checkGroundTruth(task, submission, yes, no, error) {
        var query = {trecvidId: task.trecvidId, videoNumber: submission.videoNumber, shotNumber: submission.shotNumber};
        this.findEntity(this.db.groundTruth, query, (entry) => {
            if (entry) {
                // found in groundtruth!
                yes(entry);
            } else {
                // not found
                no();
            }
        }, error, false);
    }

    extendGroundTruth(task, submission, success, error) {
        // first check if this entry already exists (might be possible due to concurrency)
        this.checkGroundTruth(task, submission, (entry) => {
            if (entry.correct !== submission.correct) {
                error("this shot already has a ground truth entry, but the judgement is different!");
            } else {
                // the same entry already exists -> nothing to do
                success();
            }
        }, () => {
            var newEntry = {
                trecvidId: task.trecvidId,
                videoNumber: submission.videoNumber,
                shotNumber: submission.shotNumber,
                correct: submission.correct,
                judge: submission.judged
            };
            this.createEntity(this.db.groundTruth, newEntry, {}, success, error);
        }, error);
    }

    isCompetitionRunning(success, error) {
        this.findCompetition({running: true}, success, error);
    }

    isValidVideoNumber(videoNumber, yes, no, error) {
        this.exists(this.db.videos, {videoNumber: parseInt(videoNumber)}, yes, no, error);
    }

    randomVideo(success, error) {
        this.count(this.db.videos, {}, (count) => {
            var skipCount = Math.floor(Math.random() * count);
            this.db.videos.find({}).skip(skipCount).limit(1).exec((err, randomVideo) => {
                if (!err) {
                    success(randomVideo[0]);
                } else {
                    error(err);
                }
            });
        }, (err) => {
            error(err);
        });
    }

}

module.exports = Database;
