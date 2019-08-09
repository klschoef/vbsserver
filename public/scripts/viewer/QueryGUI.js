class QueryGUI {

// situations when query visualization changes
//    - start task
//            depending on task type
//                    Visual: show video (with progressive blurring)
//                    Textual/AVS: show text (later refined)
//                    LSC_Textual: also show text (later refined)
//            starting in fullscreen for n seconds (initialFullscreenDuration)
//
//    - stop task
//            depending on task type
//                    Visual: reset blurring, continue video loop
//                    Textual: show video
//                    AVS: no change
//                    LSC: show sequence of relevant images
//
//    - running task at loading time -> resume
//            same as on start (except for fullscreen)
//
//    - task finished at loading time (a.g., post-hoc inspection)
//            same as after stop task

    constructor(gui) {
        this.gui = gui;
        this.viewer = gui.viewer;
        this.slideshow = new ImageSlideshow(1000);
        this.elapsedTime = -1;   // elapsed time (in seconds) since the active task was started
    }

    init() {
        this.elapsedTime = -1;
        this.updateQueryState();
    }

    updateQueryState() {
        return new Promise((resolve, reject) => {
            var task = this.viewer.getActiveTask();
            this.hideQueryInfo();
            if (task) {
                if (!task.running) {
                    this.updateTimer("TIME OVER");
                    this.showQueryInfo(task);
                }
                this.hideSlideshow();
                if (task.type.startsWith("KIS_Visual")) {
                    if (task.type.startsWith("KIS_VisualTextual")) {
                        
                        this.updateQueryText();
                        this.hideSlideshow();
                        this.showQueryVideo().then(() => {
                            if (task.finished) {
                                this.degradeQueryVideo(0, 0);
                            }
                            resolve();
                        });
                    } else {
                        this.hideQueryText();
                        this.hideSlideshow();
                        this.showQueryVideo().then(() => {
                            if (task.finished) {
                                this.degradeQueryVideo(0, 0);
                            }
                            resolve();
                        });
                    }
                } else if (task.type.startsWith("LSC_Textual")) {
                    this.updateQueryText();
                    this.hideQueryVideo();
                    if (!task.running) {
                        this.showSlideshow(task);
                    }
                    resolve();
                } else {
                    this.updateQueryText();
                    if (task.type.startsWith("AVS") || task.running) {
                        this.hideQueryVideo();
                        resolve();
                    } else {    // KIS Textual tasks has finished -> show video
                        this.showQueryVideo().then(() => {
                            if (this.viewer.isInspector) {
                                resolve();
                            } else {
                                this.unmuteVideo();
                                // this.showFullscreen("#queryVideo", config.client.initialFullscreenDuration, () => {
                                //     this.muteVideo();
                                // });
                                resolve();
                            }
                        });
                    }
                }
            } else {
                this.hideQueryVideo();
                this.hideQueryText();
                this.hideSlideshow();
                resolve();
            }
        });
    }

    startTask() {
        this.elapsedTime = -1;
        var task = this.viewer.getActiveTask();
        if (task) {

            // Send class on content element based on type of the task
            const contentEl = document.getElementById("content");
            contentEl.className = task.type;

            this.updateQueryState().then(() => {

                return;

                if (task.type.startsWith("KIS_Visual")) {
                    // If this task contains also textual part
                    if (task.type.startsWith("KIS_VisualTextual")) 
                    {
                        // 
                        // Video container
                        //
                        {
                            this.unmuteVideo();

                            // Add special class indicating that this text is in full screen mode
                            document.getElementById("queryVideo").classList.add("full-screen-zoom");

                            // Show video to upper half of screen
                            this.showFullscreenPercentHeight("#queryVideo", 50, config.client.initialFullscreenDuration, () => 
                            {
                                this.muteVideo();

                                // Remove full screen indicator class
                                document.getElementById("queryVideo").classList.remove("full-screen-zoom");
                            });
                        }

                        // 
                        // Text container
                        //
                        {
                            // Add special class indicating that this text is in full screen mode
                            document.getElementById("queryText").classList.add("full-screen-zoom");

                            // Show text to lower half of screen
                            this.showFullscreenPercentHeight("#queryText", 50, config.client.initialFullscreenDuration, () => 
                            {
                                // Remove full screen indicator class
                                document.getElementById("queryText").classList.remove("full-screen-zoom");
                            });
                        }
                    }
                    // Else it is pure Visual task 
                    else {
                        this.unmuteVideo();
                        this.showFullscreen("#queryVideo", config.client.initialFullscreenDuration, () => {
                            this.muteVideo();
                        });
                    }
                } else {
                    this.showFullscreen("#queryText", config.client.initialFullscreenDuration);
                }
            });
        } else {
            console.error("Task could not be started...");
        }
    }

    stopTask() {
        if (!this.viewer.toleranceTaskFlag) {
            this.updateTimer("TIME OVER");
            var task = this.viewer.getActiveTask();
            if (task) {
                this.updateQueryState();
            } else {
                this.hideQueryVideo();
                this.hideQueryText();
            }
        } else {
            this.updateTimer("WAITING...");
        }
    }

    hideQueryVideo() {
        $("#queryVideo").hide();
        $(".videoCtrlButton").hide();
        $("#queryVideo")[0].pause();
        $("#queryVideo")[0].ontimeupdate = null;
    }

    showQueryInfo(task) {
        if (task && task.type && task.type.startsWith("KIS") && Array.isArray(task.videoRanges) && task.videoRanges.length > 0) {
            $("#queryVideoInfo").html("Video: " + task.videoRanges[0].videoNumber);
            $("#queryVideoInfo").show();
        } else {
            this.hideQueryInfo();
        }
    }

    hideQueryInfo() {
        $("#queryVideoInfo").html("");
        $("#queryVideoInfo").hide();
    }

    degradeQueryVideo(blurSize, grayPercentage) {
        $("#queryVideo").css("filter", "blur(" + blurSize + "px) grayscale(" + grayPercentage + "%)");
    }

    showQueryVideo() {
        return new Promise((resolve, reject) => {
            var task = this.viewer.getActiveTask();
            if (task) {

                // Send class on content element based on type of the task
                const contentEl = document.getElementById("content");
                contentEl.className = task.type;

                // Edited this Promise handling due to occasional Promise exception in Chrome
                // Reference: https://stackoverflow.com/a/53167783/5481153
                var playbackInfo = this.viewer.getTaskPlaybackInfo(task);
                if (playbackInfo) {
                    $("#queryVideo").show();
                    $(".videoCtrlButton").show();
                    var video = $("#queryVideo")[0];
                    video.src = playbackInfo.src;

                    video.muted = true;
                    const promise = video.play();
                    
                    if (promise !== undefined) {
                        promise.then(() => {
                            var blurDelayList = config.client.videoBlurProgress.delay;
                            var blurSizeList = config.client.videoBlurProgress.size;
                            var grayDelayList = config.client.videoGrayscaleProgress.delay;
                            var grayPercentList = config.client.videoGrayscaleProgress.percentage;
    
                            video.ontimeupdate = () => {
                                if (video.currentTime < playbackInfo.startTimeCode || video.currentTime > playbackInfo.endTimeCode) {
                                    video.currentTime = playbackInfo.startTimeCode;
                                }
                                if (task.type.startsWith("KIS_Visual") && this.viewer.isTaskRunning()) {
    
                                    // If this VisualTextual task
                                    if (task.type.startsWith("KIS_VisualTextual")) {
    
                                        // \todo Implement dynamically/based od config
                                        this.degradeQueryVideo(15, 100);
    
                                    } 
                                    // Else it's pure Visual task
                                    else {
                                        var idx = blurDelayList.findIndex((d) => d > this.elapsedTime);
                                        if (idx < 0) {
                                            idx = blurDelayList.length - 1;
                                        } else {
                                            idx--;
                                        }
                                        idx = Math.min(idx, blurSizeList.length - 1); // avoid index out of bounds (in case of bad config)
                                        var idx2 = grayDelayList.findIndex((d) => d > this.elapsedTime);
                                        if (idx2 < 0) {
                                            idx2 = grayDelayList.length - 1;
                                        } else {
                                            idx2--;
                                        }
                                        idx2 = Math.min(idx2, grayPercentList.length - 1); // avoid index out of bounds (in case of bad config)
                                        this.degradeQueryVideo(blurSizeList[idx], grayPercentList[idx2]);
                                    }
                                    
                                } else {
                                    this.degradeQueryVideo(0, 0);
                                }
                            };
                            resolve();
                        }).catch(error => {
                            // .play() on video element failed
                            console.log(".play() on video element failed");

                            // Try to start it again
                            //video.play();
                        });
                    }
                } else {
                    reject("Active task has no query video");
                }
            } else {
                this.hideQueryVideo();
                reject("No active task");
            }
        });
    }

    zoomToHeight(element, targetHeight, duration, additionalActions) {
        var origZoom = parseFloat($(element).css("zoom"));
        var wrapper = $(element).parent();

        while ($(wrapper).height() < targetHeight) {
            this.gui.zoomElement(element, 1.01);
        }

        setTimeout(() => {
            // animate the zoom back to normal size
            var interval = setInterval(() => {
                var currentZoom = parseFloat($(element).css("zoom"));
                if (currentZoom > origZoom) {
                    this.gui.zoomElement(element, 0.99);
                } else {
                    clearInterval(interval);
                    if (additionalActions) {
                        additionalActions();
                    }
                    $(".scoreDiv").fadeIn();
                }
            }, 10);
        }, duration * 1000);
    }

    showFullscreenPercentHeight(element, percentageHeight, duration, additionalActions) {

        $(".scoreDiv").hide();

        var targetHeight = window.innerHeight
                - $("#title").outerHeight(true)
                - parseInt($("#title").css("margin-bottom")) * 2
                - parseInt($("body").css("margin-top"));

        this.zoomToHeight(element, targetHeight * (percentageHeight  / 100.0), duration, additionalActions);
    }

    showFullscreen(element, duration, additionalActions) {
        this.showFullscreenPercentHeight(element, 100, duration, additionalActions);
      }

    hideQueryText() {
        $("#queryText").hide();
    }

    showQueryText(text) {
        $("#queryText").html(text);
        $("#queryText").show();
    }

    hideSlideshow() {
        this.slideshow.hide();
    }

    showSlideshow(task) {
        this.slideshow.setTask(task).then(() => {
            this.slideshow.show();
        });
    }

    updateQueryText() {
        var task = this.viewer.getActiveTask();
        if (task) {
            if (task.type.startsWith("KIS_Textual") || task.type.startsWith("KIS_VisualTextual") || task.type.startsWith("LSC_Textual")) {
                var textIndex = 0;
                if (task.running) {
                    while (textIndex < task.textList.length - 1 && task.textList[textIndex + 1].delay <= this.elapsedTime) {
                        textIndex++;
                    }
                } else {
                    // when the task is finished, show the entire query text
                    textIndex = task.textList.length - 1;
                }
                if (textIndex > 0 && textIndex != this.previousTextIndex) {
                    this.viewer.playSound("ding");
                }
                this.previousTextIndex = textIndex;
                this.showQueryText(task.textList[textIndex].text);
            } else if (task.type.startsWith("AVS")) {
                this.showQueryText(task.avsText);
            }
        } else {
            this.hideQueryText();
        }
    }

    togglePlay() {
        var video = $("#queryVideo")[0];
        if (video.paused) {
            video.play();
            $("#playBtn").css("background-image", 'url("../images/pause.png")');
        } else {
            video.pause();
            $("#playBtn").css("background-image", 'url("../images/play.png")');
        }
    }

    openVideo() {
        window.open($("#queryVideo")[0].src, '_blank');
    }

    toggleMute() {
        var video = $("#queryVideo")[0];
        if (video.muted) {
            this.unmuteVideo();
        } else {
            this.muteVideo();
        }
    }

    muteVideo() {
        var video = $("#queryVideo")[0];
        video.muted = true;
        $("#muteBtn").css("background-image", 'url("../images/mute.png")');
    }

    unmuteVideo() {
        var video = $("#queryVideo")[0];
        video.muted = false;
        $("#muteBtn").css("background-image", 'url("../images/unmute.png")');
    }

    updateTimer(time) {
        var task = this.viewer.getActiveTask();
        if (task) {
            if (typeof time == "number") {
                $("#timer").html(this.viewer.formatTime(time));
                this.elapsedTime = task.maxSearchTime - time;
                this.updateQueryText();
            } else {
                $("#timer").html(time);
            }
        } else {
            $("#timer").html("");
        }
    }

}
