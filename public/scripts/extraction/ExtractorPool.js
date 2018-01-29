class ExtractorPool {

    constructor() {
        this.extractors = [];       // pool of FrameExtractors
        this.jobQueue = [];         // queue of ExtractionJobs        

        this.nextJobId = 1; // assign a unique id to each job

        this.init();
    }

    init() {        
        // create FrameExtractor instances
        this.extractors = [];
        for (var i = 0; i < config.client.extractorPoolSize; i++) {
            this.extractors.push(new FrameExtractor());
        }
    }
    
    reset() {
        this.jobQueue = [];
        this.init();
    }

    // extracts the frame for a given videoSrc and timeCode and draw it to the given canvas
    // upon successful extraction, callback is called
    extractFrame(playbackInfo, canvas, callback) {
        var job = new ExtractionJob(playbackInfo.src, playbackInfo.thumbTimeCode, canvas, callback);
        this.addExtractionJob(job);
    }

    // adds an ExtractionJob and executes it as soon as possible    
    addExtractionJob(job) {
        job.jobId = this.nextJobId++;
        this.jobQueue.push(job);
        this.checkQueue();
    }

    checkQueue() {
        // check for available FrameExtractors and assign as many jobs as possible
        for (var i = 0; i < this.extractors.length && this.hasPendingJobs(); i++) {
            var extractor = this.extractors[i];
            if (extractor.vacant) {
                var job = this.nextJob();
                extractor.extract(job, () => {  // job.callback is called upon success                  
                    this.checkQueue(); // when extraction is finished, check again for pending jobs
                });
            }
        }
    }

    hasPendingJobs() {
        return this.jobQueue.length > 0;
    }

    nextJob() {
        return this.jobQueue.shift();
    }

}
