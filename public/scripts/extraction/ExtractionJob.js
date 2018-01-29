class ExtractionJob {
    constructor(videoSrc, timeCode, canvas, callback) {
        this.videoSrc = videoSrc;
        this.timeCode = timeCode;
        this.canvas = canvas;
        this.jobId = null;
        this.callback = callback;   // is called when the job has been successfully executed        
    }
}