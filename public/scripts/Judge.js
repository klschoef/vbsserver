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

        var events = [{
                name: "error",
                callback: () => {
                    $("#statusDiv").html("error!!");
                    $("#statusDiv").removeClass("statusConnected");
                },
            }, {
                name: "disconnect",
                callback: () => {
                    $("#statusDiv").html("not connected!!");
                    $("#statusDiv").removeClass("statusConnected");
                },
            }, {
                name: "judge",
                callback: (data) => {
                    console.log("new submission received!");
                    $("#taskText").html(data.avsText);
                    this.showSubmission(data.submissionId,
                            data.playbackInfo.src,
                            data.playbackInfo.startTime,
                            data.playbackInfo.endTime);
                }
            }
        ];

        // identify each judge by a name to be able to differentiate
        // if login is enabled (debugMode == false), the username is considered as judge nickname
        // otherwise, the user is prompted to enter a nickname
        this.judgeName = "";

        this.socket = new ClientSockets({clientType: "judge"}, (data) => {
            if (data.username && typeof data.username == "string" && data.username.length > 0) {
                this.judgeName = data.username;
                $("#nicknameDiv").html(this.judgeName);
            } else {
                this.promptJudgeName();
            }
            $("#statusDiv").html("connected");
            $("#statusDiv").addClass("statusConnected");
        }, events);
    }

    promptJudgeName(force) {
        return new Promise((resolve, reject) => {
            var cachedName = localStorage["vbs_judgeName"];
            if (!force && cachedName && cachedName.length >= 4) {
                this.judgeName = cachedName;
                $("#nicknameDiv").html(this.judgeName);
                resolve();
            } else {
                $.confirm({
                    title: 'Enter a judge nickname',
                    content: '<input id="nicknameText" type="text" value="' + this.judgeName + '" placeholder="Your name" required />',
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
                            $("#nicknameDiv").html(this.judgeName);
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
            // nothing to do
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

        this.socket.emit('submitJudgement', {
            submissionId: this.currentSubmissionId,
            correct: correct,
            judgeName: this.judgeName
        });

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
