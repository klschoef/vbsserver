class ThumbManager {

    constructor(viewer) {
        this.viewer = viewer;
        this.frameExtractor;
        this.videoMap;   // maps videoId to additional information        
    }

    init() {
        this.frameExtractor = new ExtractorPool();
        return this.loadVideoMap();
    }
    
    reset() {
        this.frameExtractor.reset();
    }

    loadVideoMap() {
        return new Promise((resolve, reject) => {
            // request videoMap (for computing playback times)
            this.viewer.socket.emit("getVideoMap", {}, (response) => {
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

    // playback info for a given shot
    getSubmissionPlaybackInfo(submission) {
        var video = this.videoMap[submission.videoNumber];
        if (video) {
            return {
                src: config.server.videoDir + "/" + video.filename,
                thumbTimeCode: submission.frameNumber / video.fps,
                startTimeCode: video.shots[submission.shotNumber - 1].from / video.fps,
                endTimeCode: video.shots[submission.shotNumber - 1].to / video.fps
            }
        } else {
            return null;
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

    loadThumb(submission, canvas, callback) {
        var img = submission.imageId;
        if (typeof img == "string" && img.length > 0) {
            // LSC image directory has a specific format which we simply assume for now
            // TODO implement in a more generic fashion            
            var subDir = img.substring(0, 4) + "-" + img.substring(4, 6) + "-" + img.substring(6, 8);
            var imgDir = config.server.lscImageDir + "/" + subDir + "/";
            this.createFromImage(imgDir + submission.imageId, canvas, callback);
        } else {
            var playbackInfo = this.getSubmissionPlaybackInfo(submission);
            if (playbackInfo) {
                this.createFromVideo(playbackInfo, canvas, callback);
            } else {
                toastr.error("Thumbnail loading failed...");
                console.error("no thumbnail information for submission: " + JSON.stringify(submission));
            }
        }
    }

    createFromVideo(playbackInfo, canvas, callback) {
        this.frameExtractor.extractFrame(playbackInfo, canvas, callback);
    }

    createFromImage(imageSrc, canvas, callback) {
        var img = new Image();
        img.src = imageSrc;
        img.onload = () => {
            canvas.getContext("2d").drawImage(img, 0, 0);
            callback();
        };
    }

    getThumbTooltip(submission) {
        var img = submission.imageId;
        if (typeof img == "string" && img.length > 0) {
            return img;
        } else {
            var playbackInfo = this.getSubmissionPlaybackInfo(submission);
            if (playbackInfo) {
                return submission.videoNumber + "-" + submission.shotNumber + ": "
                        + this.viewer.formatTime(playbackInfo.thumbTimeCode) + "; " + submission.judged + "; " + submission.iseq;
            } else {
                return "";
            }
        }
    }

    createSlideshow(imageList, callback) {
        // TODO
    }

}