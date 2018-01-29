var viewer;
$(document).ready(function () {
    console.log("ready");
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
        // maps videoId to additional information
        this.videoMap = null;

        // TODO prompt credentials
        this.socket = new ClientSockets({clientType: "viewer"});

        this.gui = new ViewerGUI(this);

        this.init();
    }

    init() {
        $("#countdownDiv").hide();
        var promises = [];
        promises.push(this.loadVideoMap());
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
        });

        this.socket.registerEvent('startTask', (task) => {
            $("#countdownDiv").fadeOut("slow");
            console.log("TASK START");
            this.competitionState.tasks.push(task);
            this.competitionState.activeTaskIdx = this.competitionState.tasks.length - 1;
            this.resetSubmissions();
            this.gui.startTask();
        });

        this.socket.registerEvent('stopTask', (task) => {
            console.log("TASK STOP");
            this.competitionState.tasks[this.competitionState.activeTaskIdx] = task;
            this.gui.stopTask();
        });

        this.socket.registerEvent('remainingTime', (data) => {
            this.gui.remainingTime(data.time);
        });

        this.socket.registerEvent('newSubmission', (submission) => {            
            this.playSound("incoming");
            this.competitionState.submissions[submission.teamId][submission._id] = submission;
            var playbackInfo = this.getSubmissionPlaybackInfo(submission);
            this.gui.newSubmission(submission, playbackInfo);
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