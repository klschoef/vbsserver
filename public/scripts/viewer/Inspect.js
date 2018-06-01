var inspector;
$(document).ready(function () {
    console.log("ready");
    inspector = new Inspect();
});


// General Architecture of this view is analoguous to Viewer.js, but without receiving events from the server
// TODO incorporate adaptations of Viewer.js for LSC
class Inspect {
    constructor() {
        this.config = config;   // globally defined in viewer.jade

        // CompetitionState object summarizing all relevant information about the selected competition
        this.competitionState = null;
        // maps videoId to additional information
        this.videoMap = null;

        // TODO prompt credentials
        this.socket = new ClientSockets({clientType: "inspect"});

        this.isInspector = true; // flag for avoiding fullscreen query video
        this.gui = new ViewerGUI(this);

        this.init();
    }

    init() {
        var promises = [];
        promises.push(this.loadVideoMap());

        // TODO selection of competition
        promises.push(this.updateCompetitionState("k1mCozaxuU5ygs43"));
        Promise.all(promises).then(() => {
            this.gui.hideLoadingAnimation();
        })
    }

    updateCompetitionState(competitionId) {
        return new Promise((resolve, reject) => {
            // request competitionState
            this.socket.emit("getCompetitionState", {competitionId: competitionId}, (response) => {
                if (response.success) {
                    this.competitionState = response.data;
                    if (this.competitionState) {
                        this.gui.updateTitle(this.competitionState.name);
                        this.gui.init();
                        $("#activeTaskSelector").val(this.competitionState.tasks.length);
                        this.updateTaskInfo();
                    } else {
                        this.gui.updateTitle("Invalid competition...");
                    }
                    resolve();
                } else {
                    console.err("couldn't load competition state from server");
                    reject();
                }
            });
        });
    }

    updateTaskInfo() {
        var task = this.getActiveTask();
        if (task) {
            $("#activeTaskInfo").html("Task " + (this.competitionState.activeTaskIdx + 1) + " : " + task.name
                    + " (" + task.type + " " + (this.getActiveTaskSubIdx() + 1) + ")");
        }
    }

    taskSelected() {
        var taskIdx = $("#activeTaskSelector").val() - 1;
        if (taskIdx >= 0 && taskIdx < this.competitionState.tasks.length) {
            this.competitionState.activeTaskIdx = taskIdx;
            this.refreshActiveTask();
        } else {
            toastr.warning("Invalid task number");
        }
    }

    prevTask() {
        if (this.competitionState.activeTaskIdx > 0) {
            this.competitionState.activeTaskIdx--;
            $("#activeTaskSelector").val(this.competitionState.activeTaskIdx + 1);
            this.refreshActiveTask();
        }
    }

    nextTask() {
        if (this.competitionState.activeTaskIdx < this.competitionState.tasks.length - 1) {
            this.competitionState.activeTaskIdx++;
            $("#activeTaskSelector").val(this.competitionState.activeTaskIdx + 1);
            this.refreshActiveTask();
        }
    }

    refreshActiveTask() {
        var task = this.getActiveTask();
        if (task) {
            this.socket.emit("getSubmissions", {competitionId: this.competitionState.competitionId, taskId: task._id}, (response) => {
                if (response.success) {
                    this.resetSubmissions();
                    var submissionList = response.data;
                    for (var i = 0; i < submissionList.length; i++) {
                        var s = submissionList[i];
                        this.competitionState.submissions[s.teamId][s._id] = s;
                    }
                    this.gui.refresh();
                } else {
                    toastr.error("something went wrong");
                }
                this.updateTaskInfo();
            });
        }
    }

    hasCompetitionStarted() {
        return this.competitionState && (this.competitionState.running || this.competitionState.finished);
    }

    isTaskRunning() {
        var task = this.getActiveTask();
        return task && task.running;
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
        var tasks = this.competitionState.tasks;
        var activeTaskIdx = this.competitionState.activeTaskIdx;
        var activeTask = this.getActiveTask();
        var subIdx = -1;
        for (var i = 0; i <= activeTaskIdx; i++) {
            if (tasks[i].type == activeTask.type) {
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

    // playback info for a given shot
    getSubmissionPlaybackInfo(submission) {
        var video = this.videoMap[submission.videoNumber];
        return {
            src: config.server.videoDir + "/" + video.filename,
            thumbTimeCode: submission.frameNumber / video.fps,
            startTimeCode: video.shots[submission.shotNumber - 1].from / video.fps,
            endTimeCode: video.shots[submission.shotNumber - 1].to / video.fps
        }
    }

    // playback info for a KIS task
    getTaskPlaybackInfo(task) {
        if (task.type.startsWith("KIS")) {
            var range = task.videoRanges[0];
            var video = this.videoMap[range.videoNumber];
            return {
                src: config.server.videoDir + "/" + video.filename,
                startTimeCode: range.startFrame / video.fps,
                endTimeCode: range.endFrame / video.fps
            }
        } else {
            return null;
        }
    }

    playSound(title) {
        if (config.client.playAudio) {
            var sound = new Audio('./sounds/' + title + '.mp3');
            sound.play();
        }
    }

    loadVideoMap() {
        return new Promise((resolve, reject) => {
            // request videoMap (for computing playback times)
            this.socket.emit("getVideoMap", {}, (response) => {
                if (response.success) {
                    this.videoMap = response.data;
                    resolve();
                } else {
                    console.err("couldn't load video map from server");
                    reject();
                }
            });
        });
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