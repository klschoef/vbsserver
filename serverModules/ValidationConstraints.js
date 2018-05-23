var Utils = require('./Utils'),
        controller = require('./Controller'),
        Video = require('./entities/Video');

class ValidationConstraints {

    static addCustomValidators(validate) {

        var db = controller.db;

        // dummy validator to simply assure that the attribute is included in other validators
        validate.validators.dummy = () => {
            return null;
        };

        // assure that the teamNumbers per competition (!) are unique
        //  (we cannot use the unique constraint of nedb, because then identical team number across different competitions would not be possible)
        validate.validators.uniqueTeamNumber = (value, options, key, attributes) => {
            return new validate.Promise((resolve, reject) => {
                db.verifyTeamNumber(attributes.competitionId, value, (teamId) => {   // value: teamNumber                    
                    // db knows a team with this team number
                    if (teamId == attributes._id) {
                        // it is the current team -> ok   (means that some other attribute has been changed)
                        resolve();
                    } else {
                        resolve("Team number " + value + " is already assigned to another team");
                    }
                }, (err) => {
                    // means that this teamNumber does not exist for this competition -> ok
                    resolve();
                });
            });
        };

        validate.validators.validTeamNumber = (value, options, key, attributes) => {
            return new validate.Promise((resolve, reject) => {
                db.verifyTeamNumber(attributes.competitionId, value, (teamId) => {
                    resolve();
                }, (err) => {
                    resolve("Team number missing or invalid");
                });
            });
        };

        validate.validators.validVideoNumber = (value, options, key, attributes) => {
            return new validate.Promise((resolve, reject) => {
                db.findTask({_id: attributes.taskId}, (task) => {
                    if (task.type.startsWith("KIS") || task.type.startsWith("AVS")) {
                        db.isValidVideoNumber(value, () => {
                            resolve();
                        }, () => {
                            resolve("Video number missing or invalid");
                        }, (err) => {
                            resolve("Video number missing or invalid");
                        });
                    } else {
                        // for LSC tasks, videoNumbers are not in use and therefore cannot be validated
                        resolve();
                    }
                }, () => {
                    resolve("Invalid Task");
                });
            });
        };

        validate.validators.submissionCheck = (value, options, key, attributes) => {
            return new validate.Promise((resolve, reject) => {
                if (Utils.isDefined(attributes._id)) {
                    // if the _id is defined, this means that this in an update operation
                    // i.e., the other constraints have already been validated before insertion
                    resolve();
                } else {
                    controller.currentTask((task) => {
                        if (!task) {
                            resolve("no task running.");
                        } else if (task.type.startsWith("LSC")) {
                            if (typeof attributes.imageId === "string" && attributes.imageId.length > 0) {
                                resolve();
                            } else {
                                resolve("Invalid imageId");
                            }
                        } else {
                            var video = controller.videoMap[attributes.videoNumber];
                            if (task.type.startsWith("KIS")) {
                                var shotNumber = Video.frameToTrecvidShotNumber(attributes.frameNumber, video);
                                if (!Utils.isNumber(attributes.frameNumber)) {
                                    resolve("Frame number missing");
                                } else if (!Video.isValidShotNumber(shotNumber, video)) {
                                    resolve("Invalid frame number");
                                } else {
                                    resolve();
                                }
                            } else if (task.type.startsWith("AVS")) {
                                if (!Utils.isNumber(attributes.frameNumber) && !Utils.isNumber(attributes.shotNumber)) {
                                    resolve("Neither frame nor shot specified");
                                } else {
                                    if (!video) {
                                        resolve("Invalid video number");    // should already have been checked, but to be on the safe side, check again...
                                    } else {
                                        if (!attributes.shotNumber) {
                                            attributes.shotNumber = Video.frameToTrecvidShotNumber(attributes.frameNumber, video);
                                        }
                                        db.isDuplicateAVSSubmission(attributes, () => {
                                            resolve("Duplicate submission is ignored.");
                                        }, () => {
                                            if (!Video.isValidShotNumber(attributes.shotNumber, video)) {
                                                resolve("Invalid shot number");
                                            } else {
                                                resolve();
                                            }
                                        }, (err) => {
                                            resolve("Internal error (duplicate checking failed)");
                                        });
                                    }
                                }
                            } else {
                                resolve("Internal error (unsupported task type)");
                            }
                        }
                    });
                }
            });
        };

        validate.validators.taskCheck = (value, options, key, attributes) => {
            return new validate.Promise((resolve, reject) => {

                // check KIS task
                if (attributes.type.startsWith("KIS")) {
                    if (!Array.isArray(attributes.videoRanges) || attributes.videoRanges.length == 0) {
                        resolve("Missing video range");
                    } else {
                        // check video ranges
                        var ranges = attributes.videoRanges;
                        for (var i = 0; i < ranges.length; i++) {
                            var range = ranges[i];
                            if (typeof range != "object") {
                                resolve("Invalid video range");
                                return;
                            } else if (!controller.videoMap[range.videoNumber]) {
                                resolve("Video number missing or invalid");
                                return;
                            } else if (!Utils.isNumber(range.startFrame) || !Utils.isNumber(range.endFrame)
                                    || range.startFrame < 0 || range.endFrame > controller.videoMap[range.videoNumber].numFrames) {
                                resolve("Invalid video range");
                                return;
                            }
                        }
                        // check text list for KIS_Textual                                    
                        if (attributes.type.startsWith("KIS_Textual")) {
                            var msg = validateTextList(attributes);
                            if (msg === "OK") {
                                resolve();
                            } else {
                                resolve(msg);
                            }
                        } else if (!attributes.type.startsWith("KIS_Visual")) {
                            resolve("Invalid task type");
                        } else {
                            resolve();
                        }
                    }

                    // check AVS task
                } else if (attributes.type.startsWith("AVS")) {
                    if (!attributes.trecvidId || attributes.trecvidId.length == 0) {
                        resolve("A unique trecvidId is mandatory (also for non-Trecvid tasks) for correct ground truth mapping");
                    } else if (typeof attributes.avsText !== "string" || attributes.avsText.length < 10) {
                        resolve("Query text has to be a string (with some minimum length)");
                    } else {
                        resolve();
                    }

                    // check LSC task
                } else if (attributes.type.startsWith("LSC")) {
                    if (!Array.isArray(attributes.imageList) || attributes.imageList.length == 0) {
                        resolve("A list of valid imageIds is required");
                    } else if (attributes.type.startsWith("LSC_Textual")) {
                        var msg = validateTextList(attributes);
                        if (msg === "OK") {
                            resolve();
                        } else {
                            resolve(msg);
                        }
                    } else {
                        resolve("Task type '" + attributes.type + "' is currently not supported");
                    }

                } else {
                    resolve("Invalid task type");
                }
            });
        };
    }
}

function validateTextList(attributes) {
    if (!attributes) {
        return "Invalid attributes";
    }
    var textList = attributes.textList;
    if (!Array.isArray(textList) || attributes.textList.length == 0) {
        return "Missing textList";
    }
    var prevDelay = -1;
    for (var i = 0; i < textList.length; i++) {
        var textItem = textList[i];
        if (typeof textItem != "object") {
            return "Invalid textList";
        } else if (!Utils.isNumber(textItem.delay)) {
            return "Delay must be number";
        } else if (textItem.delay <= prevDelay) {
            return "Delays have to be strictly increasing";
        } else if (typeof textItem.text !== "string" || textItem.text.length < 10) {
            return "Query text has to be a string (with some minimum length)";
        }
        prevDelay = textItem.delay;
    }
    return "OK";
}

ValidationConstraints.USER = {
    username: {
        presence: true
    }
};

ValidationConstraints.COMPETITION = {
    name: {
        presence: true,
        length: {
            minimum: 3,
            message: "Competition name must be at least 3 characters long"
        }
    }
};

ValidationConstraints.TASK = {
    competitionId: {
        presence: true
    },
    name: {
        presence: true,
        length: {
            minimum: 3,
            message: "Task name must be at least 3 characters long"
        }
    },
    maxSearchTime: {
        presence: true,
        numericality: {
            onlyInteger: true,
            greaterThan: 0
        }
    },
    type: {
        inclusion: {
            within: ["KIS_Visual", "KIS_Textual", "AVS", "KIS_Visual_novice", "KIS_Textual_novice", "AVS_novice", "LSC_Textual", "LSC_Textual_novice"],
            message: "Invalid task type: %{value}"
        },
        taskCheck: true
    },
    videoRanges: {
        presence: true
    },
    textList: {
        presence: true
    },
    trecvidId: {
        presence: true
    },
    avsText: {
        presence: true
    },
    imageList: {
        presence: true
    }
};

ValidationConstraints.TASKRESULT = {};

ValidationConstraints.TEAM = {
    _id: {// needed for uniqueness check
        dummy: true
    },
    competitionId: {
        presence: true
    },
    teamNumber: {
        presence: true,
        numericality: {
            onlyInteger: true,
            greaterThan: 0
        },
        uniqueTeamNumber: true
    },
    name: {
        presence: true,
        length: {
            minimum: 3,
            message: "Team name must be at least 3 characters long"
        }
    }
    // TODO further validation (e.g., color, logoSrc...)
};

ValidationConstraints.SUBMISSION = {
    _id: {// needed for duplicate check
        dummy: true
    },
    competitionId: {
        presence: true,
        dummy: true
    },
    teamNumber: {
        presence: true,
        validTeamNumber: true
    },
    taskId: {
        presence: true
    },
    videoNumber: {
        presence: true,
        validVideoNumber: true
    },
    frameNumber: {
        submissionCheck: true
    },
    shotNumber: {
        dummy: true     // submissionCheck checks frameNumber and shotNumber
    }
};

module.exports = ValidationConstraints;
