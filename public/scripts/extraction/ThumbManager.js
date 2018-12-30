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
            this.viewer.socket.emit("getVideoMap", {skipShots: true}, (response) => {
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

    /* loads the according thumbnail image for a submission
     *  the thumb is either loading from an image file or extracted from the according video
     */
    loadThumb(submission, canvas, callback) {
        var thumbInfo = this.getThumbInfo(submission);
        if (thumbInfo.image) {
            // load image
            var img = new Image();
            img.src = thumbInfo.image.filePath;
            img.onload = () => {
                canvas.width = img.width;
                canvas.height = img.height;
                var ratio = img.width / img.height;
                var parentDiv = $(canvas).parent();
                $(parentDiv).height($(parentDiv).width() / ratio);
                canvas.getContext("2d").drawImage(img, 0, 0);
                callback();
            };
        } else if (thumbInfo.video) {
            // extract from video
            this.frameExtractor.extractFrame(thumbInfo.video.src, thumbInfo.video.timeCode, canvas, callback);
        } else {
            toastr.error("Thumbnail loading failed...");
            console.error("no thumbnail information for submission: " + JSON.stringify(submission));
        }

    }

    getThumbInfo(submission) {
        var thumbInfo = {
            video: null,
            image: null};

        var video = this.videoMap[submission.videoNumber];
        if (video) {
            thumbInfo.video = {
                src: config.server.videoDir + "/" + video.filename,
                timeCode: submission.frameNumber / video.fps
            };
        }

        var img = submission.imageId;
        if (typeof img == "string" && img.length > 8) {
            thumbInfo.image = {
                fileName: img,
                filePath: ThumbManager.getImagePath(img)
            };
        }

        return thumbInfo;
    }

    getThumbTooltip(submission) {
        var thumbInfo = this.getThumbInfo(submission);
        if (thumbInfo.image) {
            return thumbInfo.image.fileName;
        } else if (thumbInfo.video) {
            return submission.videoNumber + "-" + submission.shotNumber + ": "
                    + this.viewer.formatTime(thumbInfo.video.timeCode) + "; "
                    + submission.judged;
        } else {
            return "";
        }
    }

    getClickLink(submission) {
        var thumbInfo = this.getThumbInfo(submission);
        if (thumbInfo.image) {
            return thumbInfo.image.filePath;
        } else if (thumbInfo.video) {
            return thumbInfo.video.src;
        } else {
            return null;
        }
    }

    static getImagePath(imageName) {
        // LSC image directory has a specific format which we simply assume for now
        // TODO implement in a more generic fashion
        var subDir = imageName.substring(0, 4) + "-" + imageName.substring(4, 6) + "-" + imageName.substring(6, 8);
        var imgDir = config.server.lscImageDir + "/" + subDir + "/";
        return imgDir + imageName;
    }

}
