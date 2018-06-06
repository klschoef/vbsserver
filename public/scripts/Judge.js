var judge;

$(document).ready(() => {
    console.log("ready");
    judge = new Judge();
});

class Judge {
    constructor() {
        this.config = config;   // globally defined in judge.jade

        this.interval = null;
        this.currentSubmissionId = null;
        this.currentStartTime = 0;
        this.currentEndTime = 0;

        this.video = $("#video")[0];
        this.timeline = $("#timelineCanvas")[0];
        this.timelineCtx = this.timeline.getContext("2d");
        $("#judgeDiv").hide();

        this.judgeName = "";    // identify each judge by a name to be able to differentiate

        this.promptJudgeName().then(() => {
            $("#nicknameDiv").html(this.judgeName);
            // TODO prompt credentials
            this.socket = new ClientSockets({clientType: "judge", name: this.judgeName}, () => {
                this.registerEvents();
            });
        });
    }

    promptJudgeName(force) {
        return new Promise((resolve, reject) => {
            var cachedName = localStorage["vbs_judgeName"];
            if (!force && cachedName && cachedName.length >= 4) {
                this.judgeName = cachedName;
                resolve();
            } else {
                $.confirm({
                    title: 'Enter a judge nickname',
                    content: '<input id="nicknameText" type="text" value="' + cachedName + '" placeholder="Your name" required />',
                    theme: "dark",
                    boxWidth: '400px',
                    useBootstrap: false,
                    buttons: {
                        OK: () => {
                            var name = $("#nicknameText").val();
                            if (!name || name.length < 4) {
                                $.alert({
                                    title: "Invalid",
                                    content: "Provide a valid name with at least 4 characters",
                                    theme: "dark",
                                    boxWidth: '400px',
                                    useBootstrap: false
                                });
                                return false;
                            }
                            this.judgeName = name;
                            localStorage["vbs_judgeName"] = name;
                            resolve();
                        }
                    }
                });
            }
        });
    }

    changeNickname() {
        this.promptJudgeName(true).then(() => {
            $("#nicknameDiv").html(this.judgeName);
            location.reload(true);  // simply refresh the entire page (easiest way to register with new name)
        });
    }

    registerEvents() {
        this.socket.registerEvent('connect', () => {
            $("#statusDiv").html("connected");
            $("#statusDiv").addClass("statusConnected");
        });

        this.socket.registerEvent('error', () => {
            $("#statusDiv").html("not connected!!");
            $("#statusDiv").removeClass("statusConnected");
        });

        this.socket.registerEvent('disconnect', () => {
            $("#statusDiv").html("not connected!!");
            $("#statusDiv").removeClass("statusConnected");
        });

        this.socket.registerEvent('judge', (data) => {
            console.log("new submission received!");
            $("#taskText").html(data.avsText);
            this.showSubmission(data.submissionId,
                    data.playbackInfo.src,
                    data.playbackInfo.startTime,
                    data.playbackInfo.endTime);
        });
    }

    showSubmission(submissionId, videoSrc, startTime, endTime) {

        this.currentSubmissionId = submissionId;
        this.currentStartTime = startTime;
        this.currentEndTime = endTime;

        this.video.onloadedmetadata = () => {
            this.video.onloadedmetadata = null;
            this.video.onseeked = () => {
                this.video.onseeked = null;
                $("#waitingDiv").hide();
                $("#judgeDiv").fadeIn();
                var ratio = $(window).height() * 0.6 / $("#video").height();
                $("#video").css("zoom", ratio);
                // loop
                this.interval = setInterval(() => {
                    this.updateTimeline();
                    if (this.video.currentTime > endTime) {
                        this.video.currentTime = startTime;
                    }
                }, 40);
            };
            this.video.currentTime = startTime;
        }
        this.video.src = videoSrc;
    }

    submitJudgement(correct) {

        this.socket.emit('submitJudgement', {submissionId: this.currentSubmissionId, correct: correct});

        clearInterval(this.interval);
        this.video.pause();
        this.video.src = "";
        this.currentSubmissionId = null;

        $("#judgeDiv").hide();
        $("#waitingDiv").fadeIn();
    }

    updateTimeline() {
        this.timelineCtx.fillStyle = "#aaa";
        this.timelineCtx.fillRect(0, 0, this.timeline.width, this.timeline.height);

        this.timelineCtx.strokeStyle = "red";
        this.timelineCtx.lineWidth = 6;
        var pos = (this.video.currentTime - this.currentStartTime) / (this.currentEndTime - this.currentStartTime) * this.timeline.width;
        this.timelineCtx.beginPath();
        this.timelineCtx.moveTo(pos, 0);
        this.timelineCtx.lineTo(pos, this.timeline.height);
        this.timelineCtx.stroke();
    }

    videoJump(event) {
        var relPos = event.offsetX / $(judge.timeline).width();
        var time = this.currentStartTime + relPos * (this.currentEndTime - this.currentStartTime);
        this.video.currentTime = time;
    }

    changePlaybackRate(delta) {
        var newValue = Math.max(1, Math.min(this.video.playbackRate + delta, 10));
        this.video.playbackRate = newValue;
        $("#playbackRateText").html("Playback Rate: " + this.video.playbackRate + "x");
    }

}