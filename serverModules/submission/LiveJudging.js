var Video = require('../entities/Video'),
        controller = require('../Controller'),
        logger = require('winston');

class LiveJudging {
    constructor() {
        this.db = controller.db;
        // queue of objects of the form {task, submission, callback}
        this.queue = new Array();
    }

    clearQueue() {
        this.queue = new Array();
    }

    // judgeAvailable can either mean that (1) a new judge registered or (2) a judge finished his assignment
    judgeAvailable(judge) {
        judge.isJudging = false;
        judge.judgeAssignment = null;

        this.checkQueue();
    }

    // is called when
    //  - a new judge gets available or
    //  - a shot was found in the ground truth
    checkQueue() {
        if (this.queue.length > 0) {
            var ja = this.queue.shift();    // take the next item from the queue
            this.requestJudgement(ja.task, ja.submission, ja.callback);
        }
    }

    // this method is called by SubmissionHandlerAVS
    // but also if a job from the queue is reconsidered (to re-check ground truth!)
    requestJudgement(task, submission, callback) {
        // 1. check ground truth (trecvid + extended)
        // 2. assign to judge (if available)
        // 3. if none of the above is successful, put to queue
        this.db.checkGroundTruth(task, submission, (gt) => {
            // was found in ground truth
            logger.info("found judgement in groundtruth");
            submission.judged = gt.judge; // in case of trecvid ground truth, judge=="tv", otherwise name of the vbs judge
            submission.correct = gt.correct;
            setTimeout(() => {
                callback();
            }, Math.round(500 + Math.random() * 1500));  // always wait a short time to make it more interesting for the viewers
            this.checkQueue();
        }, () => {
            // not found in ground truth -> try to assign to judge, if not possible, put to queue
            this.requestLiveJudgement({task: task, submission: submission, callback: callback});
        }, (err) => {
            logger.error("checking ground truth failed", {task: task, submission: submission, errorMsg: err});
            this.requestLiveJudgement({task: task, submission: submission, callback: callback});
        });
    }

    requestLiveJudgement(judgeAssignment) {
        var judge = controller.socket.getAvailableJudge();
        if (judge) {
            this.assignJudge(judge, judgeAssignment);
        } else {
            // this request cannot be handled immediately, we have to queue it
            this.queue.push(judgeAssignment);
        }
    }

    assignJudge(judge, judgeAssignment) {   // judgeAssignment: {task, submission, callback}

        judge.isJudging = true;
        judge.judgeAssignment = judgeAssignment;

        var shotNumber = judgeAssignment.submission.shotNumber;
        var video = controller.videoMap[judgeAssignment.submission.videoNumber];
        var playbackInfo = Video.getPlaybackInfo(shotNumber, video);
        logger.info("Submission is sent to judge", {submissionId: judgeAssignment.submission._id, remainingJobs: this.queue.length});
        controller.socket.sendToJudge(judge, {
            avsText: judgeAssignment.task.avsText,
            submissionId: judgeAssignment.submission._id,
            playbackInfo: playbackInfo});

    }

    receiveLiveJudgement(judge, data) {

        var submissionId = data.submissionId;
        var correct = data.correct;
        var judgeName = data.judgeName;

        logger.info("Judgement received", {submissionId: submissionId, correct: correct});

        var ass = judge.judgeAssignment;
        var sub = ass.submission;

        if (submissionId !== sub._id) {
            // if this happens, something went seriously wrong...
            logger.error("submission mismatch...", {submission: sub, judgeResponse: {submissionId: submissionId, correct: correct}});
        } else {
            // the entire judgeAssignment(including callback) is stored as attribute of the judge socket
            sub.judged = "judge_" + judgeName;
            sub.correct = correct;
            ass.callback();

            // extend the ground truth with this new judgement
            this.db.extendGroundTruth(ass.task, sub, () => {
                logger.info("ground truth was extended", {videoNumber: sub.videoNumber, shotNumber: sub.shotNumber, correct: sub.correct, judged: sub.judged});
                logger.verbose("ground truth was extended", {task: ass.task, submission: sub});
                this.judgeAvailable(judge); // judge can take a new job
            }, (err) => {
                logger.error("extending ground truth failed", {task: ass.task, submission: sub, errorMsg: err});
                this.judgeAvailable(judge); // judge can take a new job
            });
        }
    }

    judgeDisconnect(judge) {
        // if the disconnecting judge currently has an assignment, we have to re-assign it
        if (judge.isJudging) {
            var ja = judge.judgeAssignment;
            this.requestJudgement(ja.task, ja.submission, ja.callback);
            judge.judgeAssignment = null;
        }
    }
}

module.exports = LiveJudging;
