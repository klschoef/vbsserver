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
        
//        Starting with n potential points (n = seconds)
//        Subtract 0.5 point per second
//        Upon submission:
//              if correct, then allocate mark
//              if incorrect reduce potential score by 10% (e.g., 100, 90, 81, 73, 66, 59, 53, 47, 43, 38, ...)
//        Minimum score zero
//        Normalise into 100 points max

        var maxPoints = maxSearchTime;
        var relMaxPoints = maxPoints * Math.pow(0.9, numWrong);             // wrong submission penalty
        var points = relMaxPoints - searchTime * 0.5;                       // time penalty
        var score = Math.min(100, Math.max(0, Math.round(points / maxPoints * 100)));   // normalization
        return score;
    }

}


module.exports = SubmissionHandlerLSC;
