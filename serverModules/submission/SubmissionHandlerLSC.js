var Utils = require('../Utils.js'),        
        config = require('../../config.json'),
        SubmissionHandlerKIS = require('./SubmissionHandlerKIS');
        

// submission handling for LSC is essentially identical to KIS, the only differences are:
//      - different judgement criterion (imageId)
//      - different scoring function
class SubmissionHandlerLSC extends SubmissionHandlerKIS{

    constructor(submissionHandler) {
        super(submissionHandler);
    }

    judge(submission, task) {
        submission.judged = "lsc";
        submission.correct = task.imageList.includes(submission.imageId);
    }

    computeScore(searchTime, maxSearchTime, numWrong) {
        
        // TODO adapt to LSC scoring function
        
        return Math.random() * 100;
        
        // no max numAttempts (is implicitly limited by subtractive penalty)
//        var timeFactor = (maxSearchTime - searchTime) / maxSearchTime;
//        var variablePart = (100 - config.task.KISMinScore) * timeFactor;
//        var baseScore = config.task.KISMinScore + variablePart;
//        var penalty = numWrong * config.task.KISPenalty;    // subtractive penalty
//
//        var score = Math.min(100, Math.max(0, Math.round(baseScore - penalty)));    // score must be max 100 and not negative (due to penalty)
//        return score;
    }

}


module.exports = SubmissionHandlerLSC;
