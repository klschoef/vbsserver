var config = require('../config.json');

class Utils {

    static roundSeconds(sec) {
        return parseFloat(sec.toFixed(2))
    }

    // Generates a random number within the given interval
    static randomIntFromInterval(min, max) {
        return Math.floor(Math.random() * (max - min + 1) + min);
    }

    // randomly shuffles an array
    static shuffle(array) {
        var currentIndex = array.length, temporaryValue, randomIndex;

        // While there remain elements to shuffle...
        while (0 !== currentIndex) {

            // Pick a remaining element...
            randomIndex = Math.floor(Math.random() * currentIndex);
            currentIndex -= 1;

            // And swap it with the current element.
            temporaryValue = array[currentIndex];
            array[currentIndex] = array[randomIndex];
            array[randomIndex] = temporaryValue;
        }

        return array;
    }

    static isNumber(value) {
        return Utils.isDefined(value) && !isNaN(value) && !isNaN(parseInt(value));
    }
    
    static isDefined(value) {
        return value !== null && value !== undefined;
    }
 
    static matches(submission, range) {
        return submission.videoNumber == range.videoNumber
                && submission.frameNumber >= Math.max(0, range.startFrame - config.task.KISFrameTolerance)
                && submission.frameNumber <= range.endFrame + config.task.KISFrameTolerance;
    }

    static matchesOnlyVideoNumber(submission, range) {
        return submission.videoNumber == range.videoNumber;
    }

}

module.exports = Utils;