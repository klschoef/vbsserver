var viewer;
$(document).ready(function () {
    console.log("ready");
    $("#countdownDiv").hide();
    viewer = new Viewer();
});


/*  General Architecture of this view:
 *      - Viewer encapsulates the competition state and is responsible for keeping it up to date
 *      - ViewerGUI delegates updates to the corresponding module
 *          - TeamGUI:  shows a column with team information and submissions of active task
 *          - QueryGUI: displays the current query (video and/or text) + timer
 *          - ResultsGUI: displays sub-scores and overall scores (in tables and/or charts)
 */
class Viewer {
    constructor() {
        this.config = config;   // globally defined in viewer.jade

        // CompetitionState object summarizing all relevant information about the current competition
        this.competitionState = null;

        // during a "tolerance extension" of a task, this flag is set to true
        this.toleranceTaskFlag = false;

        this.socket = new ClientSockets({clientType: "viewer"}, () => {
            this.gui = new ViewerGUI(this);
            this.thumbManager = new ThumbManager(this);
            this.init();
        });
    }

    init() {
        var promises = [];
        promises.push(this.thumbManager.init());
        promises.push(this.updateCompetitionState());
        Promise.all(promises).then(() => {
            this.registerEvents();
            this.gui.hideLoadingAnimation();
        })
    }

    registerEvents() {

        this.socket.registerEvent('fullRefresh', () => {
            console.log("FULL REFRESH");
            location.reload(true);  // simply refresh the entire page
        });

        this.socket.registerEvent('startCompetition', (task) => {
            console.log("COMPETITON START");
            location.reload(true);  // simply refresh the entire page
        });

        this.socket.registerEvent('stopCompetition', (task) => {
            console.log("COMPETITON STOP");
            // TODO whatever we want to do ...
            // award ceremony...??
        });

        this.socket.registerEvent('countdown', (time) => {
            $("#countdownDiv").fadeIn();
            $("#countdownTime").html(time);
            if (time > 0) {
                this.playSound("beep");
            }
        });

        this.socket.registerEvent('startTask', (task) => {
            $("#countdownDiv").fadeOut("slow");
            console.log("TASK START");
            this.playSound("startup");
            this.competitionState.tasks.push(task);
            this.competitionState.activeTaskIdx = this.competitionState.tasks.length - 1;
            this.resetSubmissions();
            this.gui.startTask();
        });

        this.socket.registerEvent('stopTask', (task) => {
            console.log("TASK STOP");
            this.competitionState.tasks[this.competitionState.activeTaskIdx] = task;
            this.gui.stopTask();
            if (this.haveAllTeamsSucceeded()) {
                setTimeout(() => {  // wait a short time for the applause to diminish
                    this.playSound("winning");
                }, 1000);
            } else {
                this.playSound("losing");
            }
        });

        this.socket.registerEvent('toleranceExtension', () => {
            console.log("tolerance extension");
            // TODO in case of reconnection during the extension period, this information should also be available
            this.toleranceTaskFlag = true;
        });

        this.socket.registerEvent('toleranceTimeout', () => {
            console.log("tolerance time is over");
            this.toleranceTaskFlag = false;
            this.gui.stopTask();
        });

        this.socket.registerEvent('remainingTime', (data) => {
            this.gui.remainingTime(data.time);
            if (Math.abs(data.time - 10) < 0.3) {
                this.playSound("hurry");
            }
            if (data.time < 9.5 && data.time > 0) {
                this.playSound("beep");
                if (data.time < 5.5) {
                    setTimeout(() => {
                        this.playSound("beep");
                    }, 500);
                    if (data.time < 2.5) {
                        setTimeout(() => {
                            this.playSound("beep");
                        }, 250);
                        setTimeout(() => {
                            this.playSound("beep");
                        }, 750);
                    }
                }
            }
        });

        this.socket.registerEvent('newSubmission', (submission) => {
            this.playSound("incoming");
            if (submission.judged) {
                if (submission.correct) {
                    this.playSound("applause");
                } else {
                    this.playSound("boo");
                }
            }
            this.competitionState.submissions[submission.teamId][submission._id] = submission;
            this.gui.newSubmission(submission);
        });

        this.socket.registerEvent('newJudgement', (submission) => {
            if (submission.correct) {
                this.playSound("applause");
            } else {
                this.playSound("boo");
            }
            this.competitionState.submissions[submission.teamId][submission._id] = submission;
            this.gui.newJudgement(submission);
        });

        this.socket.registerEvent('updateAVSStatistics', (avsStatistics) => {
            this.competitionState.avsStatistics = avsStatistics;
            this.gui.updateAVSStatistics();
        });

        this.socket.registerEvent('scoreUpdate', (results) => {
            this.competitionState.results = results;
            this.gui.scoreUpdate();
        });

    }

    updateCompetitionState() {
        return new Promise((resolve, reject) => {
            // request current competitionState
            this.socket.emit("getCompetitionState", {}, (response) => {
                if (response.success) {
                    this.competitionState = response.data;
                    if (this.competitionState) {
                        this.gui.updateTitle(this.competitionState.name);
                        this.gui.init();
                    } else {
                        this.gui.updateTitle("Waiting for competition to start...");
                    }
                    resolve();
                } else {
                    console.err("couldn't load competition state from server");
                    reject();
                }
            });
        });
    }

    hasCompetitionStarted() {
        return this.competitionState && (this.competitionState.running || this.competitionState.finished);
    }

    haveAllTeamsSucceeded() {
        var teamIds = this.getTeamIds();
        for (var i = 0; i < teamIds.length; i++) {
            var teamResult = this.getCurrentTeamResult(teamIds[i]);
            if (!teamResult || teamResult.numCorrect == 0) {
                return false;
            }
        }
        return true;
    }

    // playback info for a KIS task
    getTaskPlaybackInfo(task) {
        if (task.type.startsWith("KIS")) {
            var range = task.videoRanges[0];
            var video = this.thumbManager.videoMap[range.videoNumber];

            let prerenderedVideoFilepath = null;

            // Get potential prerendered video filepath
            const potPrerenderedVidFilepath = config.server.videoPrerenderedDir + "/" + video.filename;
            // Check if this video is available to front-end
            if (task.presentPrerenderedVideo && checkIfLinkAccessible(potPrerenderedVidFilepath))
            {
                prerenderedVideoFilepath = potPrerenderedVidFilepath;
            }

            return {
                srcPrerendered: prerenderedVideoFilepath,
                src: config.server.videoDir + "/" + video.filename,
                startTimeCode: range.startFrame / video.fps,
                endTimeCode: range.endFrame / video.fps
            }
        } else {
            return null;
        }
    }

    isTaskRunning() {
        var task = this.getActiveTask();
        return task && task.running;
    }

    getServerAddress() {
        if (this.config && this.config.server) {
            return this.config.server.websocketURL + ":" + this.config.server.port;
            return "";
        }
    }

    getActiveTask() {
        if (this.competitionState && this.competitionState.activeTaskIdx >= 0
                && this.competitionState.activeTaskIdx < this.competitionState.tasks.length) {
            return this.competitionState.tasks[this.competitionState.activeTaskIdx];
        } else {
            return null;
        }
    }

    getActiveTaskSubIdx() {
        var activeTask = this.getActiveTask();
        return this.getTaskTypeSubIdx(activeTask.type);
    }

    getTaskTypeSubIdx(taskType) {
        var tasks = this.competitionState.tasks;
        var activeTaskIdx = this.competitionState.activeTaskIdx;
        var subIdx = -1;
        for (var i = 0; i <= activeTaskIdx; i++) {
            if (tasks[i].type == taskType) {
                subIdx++;
            }
        }
        return subIdx;
    }

    getCurrentTeamResult(teamId) {
        return this.competitionState.results[teamId].taskResults[this.competitionState.activeTaskIdx];
    }

    getTeams() {
        var teamIds = this.getTeamIds();
        var teams = [];
        for (var i = 0; i < teamIds.length; i++) {
            teams.push(this.competitionState.results[teamIds[i]].team);
        }
        return teams.sort((a, b) => a.teamNumber - b.teamNumber);
    }

    getTeamIds() {
        if (this.competitionState) {
            return Object.keys(this.competitionState.results);
        } else {
            return [];
        }
    }

    getTeam(teamId) {
        if (teamId) {
            return this.competitionState.results[teamId].team
        }
    }

    getSubmission(teamId, submissionId) {
        return this.competitionState.submissions[teamId][submissionId];
    }

    resetSubmissions() {
        for (var teamId in this.competitionState.submissions) {
            this.competitionState.submissions[teamId] = {};
        }
        this.competitionState.avsStatistics = {
            submissions: 0,
            unjudged: 0,
            videos: 0,
            ranges: 0
        };
    }

    playSound(title) {
        if (config.client.playAudio) {
            var sound = new Audio('./sounds/' + title + '.mp3');
            sound.play();
        }
    }

    formatTime(seconds) {
        seconds = Math.round(Math.max(seconds, 0)); // don't go negative...
        var hours = Math.floor(seconds / 3600);
        seconds = seconds % 3600;
        var minutes = Math.floor(seconds / 60);
        var seconds = seconds % 60;

        if (hours < 10) {
            hours = '0' + hours;
        }
        if (minutes < 10) {
            minutes = '0' + minutes;
        }
        if (seconds < 10) {
            seconds = '0' + seconds;
        }
//        return hours + ':' + minutes + ':' + seconds;
        return minutes + ':' + seconds;
    }

}
