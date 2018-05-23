var test;
$(document).ready(function () {
    console.log("ready");
    test = new Test();
});

class Test {
    constructor() {
        this.config = config;   // globally defined in viewer.jade

        // CompetitionState object summarizing all relevant information about the current competition
        this.competitionState = null;
        // maps videoId to additional information
        this.videoMap = null;

        // for testing AVS, it is better to only submit videos from a restricted pool (e.g., 20 videos)
        this.videoPool = null;

        // TODO prompt credentials
        this.socket = new ClientSockets({clientType: "test"});

        this.socket.registerEvent("startCompetition", () => {
            this.refresh();
        });
        this.socket.registerEvent("startTask", () => {
            this.refresh();
        });
        this.socket.registerEvent("stopCompetition", () => {
            this.refresh();
        });
        this.socket.registerEvent("stopTask", () => {
            this.refresh();
        });
        this.socket.registerEvent("judge", (assignment) => {
            var judgeMinDelay = parseInt($("#judgeMinDelay").val());
            var judgeMaxDelay = parseInt($("#judgeMaxDelay").val());
            var judgeDelay = Math.round(judgeMinDelay + Math.random() * (judgeMaxDelay - judgeMinDelay));
            this.log("delaying judgement by " + judgeDelay + "ms");
            setTimeout(() => {
                var correct = (Math.random() > 0.4) ? true : false;
                this.socket.emit('submitJudgement', {submissionId: assignment.submissionId, correct: correct});
                this.log("judgement submitted: " + correct);
            }, judgeDelay);
        });

        this.lastLogTime = 0;
        this.logBuffer = "";
        this.logFreq = 3;   // log refreshs per second
        this.logTimeout = null;
        this.logMaxLength = 100000;

        this.init();
    }

    init() {
        this.loadVideoMap().then(() => {
            this.refresh();
        });
    }

    refresh() {
        this.updateCompetitionState().then(() => {
            if (this.competitionState) {
                $("#currentCompetition").html(this.competitionState.name);
                if (this.competitionState.activeTaskIdx >= 0) {
                    this.currentTask = this.competitionState.tasks[this.competitionState.activeTaskIdx];
                    $("#currentTask").html(this.formatTask(this.currentTask));
                    if (this.currentTask.type.startsWith("KIS") || this.currentTask.type.startsWith("LSC")) {
                        $("#kisBtns").show();
                        $("#avsBtns").show();
                    } else {
                        $("#kisBtns").hide();
                        $("#avsBtns").show();
                    }
                    $("#controlDiv").show();
                } else {
                    $("#currentTask").html("None");
                }
                this.buildTeamDiv();
            } else {
                $("#currentCompetition").html("None");
                $("#currentTask").html("None");
                $("#teams").html("None");
            }
        });
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

    updateCompetitionState() {
        return new Promise((resolve, reject) => {
            // request current competitionState
            this.socket.emit("getCompetitionState", {}, (response) => {
                if (response.success) {
                    this.competitionState = response.data;
                    resolve();
                } else {
                    console.err("couldn't load competition state from server");
                    reject();
                }
            });
        });
    }

    buildTeamDiv() {
        var str = "";
        $("#teamSelect").empty();
        $("#teamSelect").append("<option value='Random'>Random Team</option>")
        for (var teamId in this.competitionState.results) {
            var team = this.competitionState.results[teamId].team;
            str += this.formatTeam(team) + ", ";
            $("#teamSelect").append("<option value='" + teamId + "'>" + team.teamNumber + ": " + team.name + "</option>")
        }
        $("#teams").html(str);
    }

    getSelectedTeam() {
        var teamId = $("#teamSelect").val();
        if (teamId == "Random") {
            var teamIds = Object.keys(this.competitionState.results);
            var randomIdx = Math.floor(Math.random() * teamIds.length);
            teamId = teamIds[randomIdx];
        }
        return this.competitionState.results[teamId].team;
    }

    correctSubmit(team) {
        if (!team) {
            team = this.getSelectedTeam();
        }
        var teamNumber = team.teamNumber;
        if (this.currentTask.type.startsWith("KIS")) {
            var range = this.currentTask.videoRanges[0];
            var videoNumber = range.videoNumber;
            var frameNumber = range.startFrame + Math.round(Math.random() * (range.endFrame - range.startFrame));
            this.submit("VBS", teamNumber, videoNumber, frameNumber);
        } else if (this.currentTask.type.startsWith("LSC")) {
            var images = this.currentTask.imageList;
            var randomIdx = Math.floor(Math.random() * images.length);
            var imageId = images[randomIdx];
            this.submit("LSC", teamNumber, null, null, imageId);
        } else {
            toastr.warning("Correct submit is not possible for task type " + this.currentTask.type);
        }
    }

    allCorrect()
    {
        for (let teamId in this.competitionState.results) {
            setTimeout(() => {
                this.correctSubmit(this.competitionState.results[teamId].team);
            }, Math.round(Math.random() * 2000));
        }
    }

    wrongSubmit() {
        var teamNumber = this.getSelectedTeam().teamNumber;
        if (this.currentTask.type.startsWith("KIS")) {
            var video = this.getRandomVideo();
            if (video._id == this.currentTask.videoRanges[0].videoId) {
                wrongSubmit();  // try again
            } else {
                var videoNumber = video.videoNumber;
                var frameNumber = Math.floor(Math.random() * video.numFrames);
                this.submit("VBS", teamNumber, videoNumber, frameNumber);
            }
        } else if (this.currentTask.type.startsWith("LSC")) {
            this.submit("LSC", teamNumber, null, null, "someWrongImageId");
        } else {
            toastr.warning("Wrong submit is not possible for task type " + this.currentTask.type);
        }
    }

    randomSubmit() {
        if (this.currentTask.type.startsWith("AVS")) {
            var video = this.getRandomVideo();
            var teamNumber = this.getSelectedTeam().teamNumber;
            var videoNumber = video.videoNumber;
            var frameNumber = Math.floor(Math.random() * video.numFrames);
            this.submit("VBS", teamNumber, videoNumber, frameNumber);
        } else {
            toastr.warning("Random submit is not possible for task type " + this.currentTask.type);
        }

    }

    randomBatch() {
        var amount = $("#randomAmount").val();
        var duration = $("#randomDuration").val();
        $("#randomBatch").attr("disabled", true);
        var remaining = amount;
        for (var i = 0; i < amount; i++) {
            setTimeout(() => {
                if (--remaining == 0) {
                    this.log("Random submissions finished.");
                    $("#randomBatch").attr("disabled", false);
                } else {
                    this.log(remaining + " random submission remaining");
                }
                this.randomSubmit();
            }, Math.round(Math.random() * duration * 1000));
        }
    }

    submit(competitionType, teamNumber, videoNumber, frameNumber, imageId) {
        if (competitionType == "VBS") {
            var url = "http://" + config.server.websocketURL + ":" + config.server.port + "/vbs/submit?";
            url += "team=" + teamNumber;
            url += "&video=" + videoNumber;
            url += "&frame=" + frameNumber;
            url += "&iseq=" + this.randomIseq();
        } else if (competitionType == "LSC") {
            var url = "http://" + config.server.websocketURL + ":" + config.server.port + "/lsc/submit?";
            url += "team=" + teamNumber;
            url += "&image=" + imageId;
        } else {
            toastr.warning("Submission failed");
            return;
        }
        this.log(url);
        $.ajax({
            url: url,
            success: (data) => {
                this.log(data);
            },
            error: (err) => {
                console.error(err);
            }
        });
    }

    randomIseq() {
        var length = Math.round(Math.random() * 30);
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        var iseq = ""
        for (var i = 0; i < length; i++) {
            iseq += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return iseq;
    }

    constructCompetition() {
        var competition = {name: "My Test Competition " + Math.round(Math.random() * 10000)};
        test.socket.emit("createCompetition", competition, (response) => {
            this.log(response.data);
            for (var i = 0; i < 5; i++) {
                this.constructRandomTask(response.data._id, "KIS_Visual");
                this.constructRandomTask(response.data._id, "KIS_Textual");
                this.constructRandomTask(response.data._id, "AVS");
            }

            for (var i = 1; i <= 9; i++) {
                this.constructTeam(response.data._id, i);
            }
        });
    }

    constructRandomTask(competitionId, type) {
        var newTask = {
            competitionId: competitionId,
            name: "Task " + Math.round(Math.random() * 10000),
            maxSearchTime: 300,
            // by default, create a random KIS_Visual task
            type: type,
            running: false,
            finished: false,
            startTimeStamp: null,
            endTimeStamp: null
        };

//        if (type.startsWith("KIS")) {
        newTask.videoRanges = [this.getRandomVideoRange()];
        newTask.textList = [
            {delay: 0, text: "A sign for a suggestion box (with tree stars on top) and a box below, with people passing by and casting letters. Then the the camera moves of up to a poster saying 'If it'll save a second, IT'S A GREAT IDEA'"}];
//                {delay: 0, text: "Find the very interesting sequence where..."},
//                {delay: 10, text: "extended text after 10 seconds"},
//                {delay: 20, text: "extended text after 20 seconds"},
//                {delay: 30, text: "extended text after 30 seconds"},
//                {delay: 40, text: "extended text after 40 seconds"},
//                {delay: 50, text: "extended text after 50 seconds"}];
//        } else if (type.startsWith("AVS")) {
        newTask.trecvidId = "VBS_" + Math.round(Math.random() * 100000000)
        newTask.avsText = "Find shots of a person holding a poster on the street at daytime";
//        }

        this.socket.emit("createTask", newTask, (response) => {
            this.log(response.data);
        });
    }

    constructTeam(competitionId, teamNumber) {
        var teams2018 = ["VIREO", "VITRIVR", "ITEC1", "ITEC2", "VNU", "SIRET", "NECTEC", "VERGE", "HTW"];
        var hueStep = 1 / teams2018.length;
        var offset = 0.34;
        var i = teamNumber - 1;
        var newTeam = {
            competitionId: competitionId,
            name: teams2018[i],
            teamNumber: teamNumber,
            color: this.HSVtoRGB((hueStep * i + offset) % 1, 1, 0.8),
            logoSrc: "images/logos/2018/" + teams2018[i].toLowerCase() + ".png"
        };
        this.socket.emit("createTeam", newTeam, (response) => {
            this.log(response.data);
        });
    }

    getRandomVideoRange() {
        var video = this.getRandomVideo();
        var videoLength = video.numFrames / video.fps;
        var startTime = Math.random() * (videoLength - 20);
        var startFrame = Math.floor(startTime * video.fps);
        var endFrame = startFrame + Math.floor(20 * video.fps);
        return {
            videoId: video._id,
            videoNumber: video.videoNumber,
            startFrame: startFrame,
            endFrame: endFrame
        };
    }

    getRandomVideo() {
        var videoNumbers = Object.keys(this.videoMap);
        if (this.videoPool) {
            videoNumbers = this.videoPool;
        }
        var randomVideoNumber = videoNumbers[Math.floor(Math.random() * videoNumbers.length)];
        return this.videoMap[randomVideoNumber];
    }

    limitVideos() {
        if ($("#limitNumVideos").is(":checked")) {
            this.videoPool = [];
            var numVideos = parseInt($("#numVideos").val());
            var videoNumbers = Object.keys(this.videoMap);
            for (var i = 0; i < numVideos; i++) {
                this.videoPool.push(videoNumbers[Math.floor(Math.random() * videoNumbers.length)]);
            }
        } else {
            this.videoPool = null;
        }
        console.log(this.videoPool);
    }

    getRandomColor() {
        var letters = '0123456789ABCDEF';
        var color = '#';
        for (var i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }

    formatTask(task) {
        var str = task.name + " - " + task.type + " : ";
        if (task.type.startsWith("KIS")) {
            var range = task.videoRanges[0];
            str += range.videoNumber + "; " + range.startFrame + " - " + range.endFrame;
            if (task.type.startsWith("KIS_Textual")) {
                str += "; " + task.textList.toString();
            }
        } else {
            str += task.trecvidId + "; " + task.avsText;
        }
        if (task.finished) {
            str += " (finished)";
        }
        return str;
    }

    formatTeam(team) {
        return team.teamNumber + " : " + team.name;
    }

    log(text) {
        var ts = new Date();
        if (typeof text === "object") {
            text = JSON.stringify(text);
        }
        if (text.length > 0) {
            this.logBuffer += text + "\n";
        }
        if (ts - this.lastLogTime < 1000 / this.logFreq) {
            if (!this.logTimeout) {
                this.logTimeout = setTimeout(() => {
                    this.log("");
                }, 1000 / this.logFreq);
            }
        } else {
            var prev = $("#logArea").html();
            var newLength = prev.length + this.logBuffer.length;
            if (newLength > this.logMaxLength) {
                var cutIdx = newLength - this.logMaxLength;
                prev = prev.substr(cutIdx);
            }
            $("#logArea").html(prev + this.logBuffer);
            $('#logArea').scrollTop($('#logArea')[0].scrollHeight);
            this.logBuffer = "";
            this.lastLogTime = ts;
            clearTimeout(this.logTimeout);
            this.logTimeout = null;
        }
    }

    clearLog() {
        $("#logArea").html("");
    }

    /**
     * Converts an HSV color value to RGB. Conversion formula
     * adapted from http://en.wikipedia.org/wiki/HSV_color_space.
     * Assumes h, s, and v are contained in the set [0, 1] and
     * returns r, g, and b in the set [0, 255]. edit: returns a hex string
     *
     * @param   Number  h       The hue
     * @param   Number  s       The saturation
     * @param   Number  v       The value
     * @return  Array           The RGB representation  edit: returns a hex string
     */
    HSVtoRGB(h, s, v) {
        var r, g, b;

        var i = Math.floor(h * 6);
        var f = h * 6 - i;
        var p = v * (1 - s);
        var q = v * (1 - f * s);
        var t = v * (1 - (1 - f) * s);

        switch (i % 6) {
            case 0:
                r = v, g = t, b = p;
                break;
            case 1:
                r = q, g = v, b = p;
                break;
            case 2:
                r = p, g = v, b = t;
                break;
            case 3:
                r = p, g = q, b = v;
                break;
            case 4:
                r = t, g = p, b = v;
                break;
            case 5:
                r = v, g = p, b = q;
                break;
        }

        return "#" + this.pad(Math.round(r * 255).toString(16), 2)
                + this.pad(Math.round(g * 255).toString(16), 2)
                + this.pad(Math.round(b * 255).toString(16), 2);
    }

    pad(value, length) {
        value = new String(value);
        while (value.length < length) {
            value = "0" + value;
        }
        return value;
    }

}