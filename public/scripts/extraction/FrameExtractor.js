// represents a single "extractor" instance that uses a html video element to extract keyframes
// gets an ExtractionJob and then calls a callback
class FrameExtractor {

    constructor() {
        this.video = document.createElement("video");
        this.video.autoplay = false;
        this.video.preload = "metadata";

        this.vacant = true;
        this.currentJob = null;
        this.refreshInterval = null;
    }
    
    reset() {
        clearInterval(this.refreshInterval); // there might still be an active interval waiting for seek
        this.video.pause();
        this.video.src = "";
        this.video.load();   // explicitly load empty source
        this.vacant = true;
        this.currentJob = null;       
    }

    extract(job, callback) {        
        if (!this.vacant) {
            console.error("FrameExtractor is currently busy... extraction job might get lost!");
            return false;
        }        
        
        this.vacant = false;    
        this.currentJob = job;
        this.video.src = job.videoSrc;
        this.video.load();
        this.video.oncanplay = () => {

            this.video.oncanplay = null;
            this.video.currentTime = job.timeCode;

            // some videos sometimes get stuck in the seeking process... 
            // but it seems this can be solved by setting the playbackTime again
            this.refreshInterval = setInterval(() => {
                if (this.video.seeking) {
                    // attention: it might be possible that the interval fires
                    // during a subsequent seek of a new job! 
                    // in that case, we would jump to a wrong position!
                    if (this.currentJob && this.currentJob.jobId === job.jobId) {
                        console.log("video is still seeking...try again... "
                                + job.timeCode + " @ " + this.video.src);
                        this.video.currentTime = job.timeCode;
                        this.video.load();
                    } else {
                        console.error("Warning: This should not happen! (Interval conflict)");
                    }
                } else {
                    clearInterval(this.refreshInterval);
                }
            }, 10000);

            this.video.onseeked = () => {
                this.video.onseeked = null;
                this.video.onerror = null;
                this.video.pause();
                                
                job.canvas.width = this.video.videoWidth;
                job.canvas.height = this.video.videoHeight;
                job.canvas.getContext("2d").drawImage(this.video, 0, 0);
                
                job.callback();
                
                this.reset();                
                callback();
            }
        };

        // it might be possible that the given video does not exist (e.g., because it has been deleted in this session)
        // -> ignore this job
        this.video.onerror = (e) => {
            this.video.onerror = null;
            console.log("error with extraction job: " + this.video.error.message);            
            this.reset();            
            callback();
        }
    }
 
}
