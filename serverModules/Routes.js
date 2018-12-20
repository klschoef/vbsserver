var url = require('url'),
        controller = require('./Controller'),
        config = require('../config.json'),
        logger = require('winston'),
        Utils = require('./Utils');

class Routes {

    // setup all express routes
    constructor(app) {

        app.get('/', (req, res) => {
            res.render('index', {
                config: JSON.stringify(config)
            });
        });

        app.get('/test', (req, res) => {
            logger.info("Request for test page");
            logger.verbose("Request for test page", {requestHeaders: req.headers});
            if (config.debugMode) {
                res.render('test', {
                    config: JSON.stringify(config)
                });
            } else {
                res.send("Hello World. Server is running.");
            }
        });

        // only admin users can access edit and control views
        // data is only passed after successful login (via web socket)
        app.get('/edit', (req, res) => {
            logger.info("Request for edit page");
            logger.verbose("Request for edit page", {requestHeaders: req.headers});
            res.render('edit', {
                config: JSON.stringify(config)
            });
        });

        app.get('/control', (req, res) => {
            logger.info("Request for control page");
            logger.verbose("Request for control page", {requestHeaders: req.headers});
            res.render('control', {
                config: JSON.stringify(config)
            });
        });

        // viewer only displays what is going on at the server (current task etc.)
        // multiple clients can use this view simultaneously (but login required)
        // data is only passed after successful login (via web socket)
        app.get('/viewer', (req, res) => {
            logger.info("Request for viewer page");
            logger.verbose("Request for viewer page", {requestHeaders: req.headers});
            res.render('viewer', {
                config: JSON.stringify(config)
            });
        });

        // a new judge wants to register
        app.get('/judge', (req, res) => {
            logger.info("Request for judge page");
            logger.verbose("Request for judge page", {requestHeaders: req.headers});
            res.render('judge', {
                config: JSON.stringify(config)
            });
        });

        app.get('/inspect', (req, res) => {
            logger.info("Request for inspect page");
            logger.verbose("Request for inspect page", {requestHeaders: req.headers});
            res.render('inspect', {
                config: JSON.stringify(config)
            });
        });

        app.get('/export', (req, res) => {
            logger.info("Request for export page");
            logger.verbose("Request for export page", {requestHeaders: req.headers});
            res.render('export', {
                config: JSON.stringify(config)
            });
        });

        // submission format:  <serveraddress:port>/vbs/submit?team=<int>&video=<int>&frame=<int>&shot=<int>
        // frame number is 0-based
        // shot id is 1-based (in accordance with the Trecvid master shot reference (msb)
        // TODO: maybe limit the number of submissions per second to avoid a denial of service attack like behaviour
        app.get('/vbs/submit', (req, res) => {

            this.computeSearchTime((searchTime, timestamp) => {

                // parse parameters
                var url_parts = url.parse(req.url, true);
                var query = url_parts.query;
                var teamNumber = parseInt(query.team);
                var videoNumber = parseInt(query.video);
                var frameNumber = parseInt(query.frame);
                var shotNumber = parseInt(query.shot);
                var iseq = query.iseq;

                controller.submissionHandler.handleSubmission(teamNumber, videoNumber, frameNumber, shotNumber, undefined, iseq, searchTime, timestamp, res);
            });
        });

        app.post('/vbs/submit', (req, res) => {

            if (!req.body) {
                logger.verbose("submission with missing body in POST request");
                res.send("Missing body in POST request!");
                return;
            }

            this.computeSearchTime((searchTime, timestamp) => {

                // parse parameters
                var teamNumber = parseInt(req.body.team);
                var videoNumber = parseInt(req.body.video);
                var frameNumber = parseInt(req.body.frame);
                var shotNumber = parseInt(req.body.shot);
                var iseq = req.body.iseq;

                controller.submissionHandler.handleSubmission(teamNumber, videoNumber, frameNumber, shotNumber, null, iseq, searchTime, timestamp, res);

            });
        });

        app.get('/lsc/submit', (req, res) => {
            this.computeSearchTime((searchTime, timestamp) => {

                // parse parameters
                var url_parts = url.parse(req.url, true);
                var query = url_parts.query;
                var teamNumber = parseInt(query.team);
                var imageId = query.image;

                controller.submissionHandler.handleSubmission(teamNumber, 0, 0, 0, imageId, undefined, searchTime, timestamp, res);
            });
        });

        app.post('/vbs/actionLog', (req, res) => {

            if (!req.body || Object.keys(req.body) == 0) {
                logger.verbose("submission with missing body in POST request");
                res.send("Missing body in POST request!");
                return;
            }

            controller.currentTask((task) => {
              this.computeSearchTime((searchTime, timestamp) => {

                  var jsonLog = req.body;
                  if (task) {
                    jsonLog.taskId = task._id;
                  }
                  if (searchTime) {
                    jsonLog.searchTime = searchTime;
                  }
                  jsonLog.serverTimestamp = timestamp;

                  // TODO log format could be validated inside this function
                  controller.db.createActionLogEntry(jsonLog, () => {
                    res.send("actionLog OK");
                  }, () => {
                    res.send("actionLog Error");
                  });
              });
            });
        });
    }

    computeSearchTime(callback) {
        var timestamp = Date.now();
        controller.currentTask((task) => {
            if (task) {
                callback(Utils.roundSeconds((timestamp - task.startTimeStamp) / 1000), timestamp);
            } else {
                callback(NaN, timestamp);
            }
        });

    }
}

module.exports = Routes;
