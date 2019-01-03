var express = require('express')
        , app = express()
//        , bodyParser = require("body-parser")
        , url = require('url')
        , fs = require('fs-extra')
        , server = require('http').createServer(app);

//app.use(bodyParser.urlencoded());
//app.use(express.bodyParser());

// serve static content
app.use(express.static(__dirname + '/public'));

// Enable cross-origin resource sharing
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

// enable POST submissions (with JSON encoded body)
//app.use(bodyParser.urlencoded());  // deprecated
//app.use(express.urlencoded());
app.use(express.json());

app.use(function (error, req, res, next) {
    if (error instanceof SyntaxError) {
        console.log("SyntaxError: " + error.type);
        res.send("SyntaxError: " + error.type + ". Something seems to be wrong with your actionLog entry! (JSON encoded POST body!)");
    } else {
        next();
    }
});

// keep record of clients that send submission requests and block if they send too much ("flooding")
var clientMap = {};

app.get('/', function (req, res) {
    res.send("<!DOCTYPE html><html><head><title>VBS 2019 TestServer</title></head>"
            + "<body style='line-height: 1.3; margin: 20px;'>"
            + "<h2>Welcome to the VBS 2019 Test Server</h2>"
            + "To submit a result please send an HTTP POST request to the following URI:"
            + "<br><br>http://demo2.itec.aau.at:80/vbs/submit"
            + "<br><br> with the following URL parameters:"
            + "<ul>"
            + "<li>team=[your team id]</li>"
            + "<li>member=[internal team member id] (to differentiate between different instances of the same tool)</li>"
            + "<li>video=[id of the video according to the V3C1 data set (1-7475)]</li>"
            + "<li>frame=[zero-based frame number (this frame must be <u>inside</u> the target segment in order to be rated as correct)]</li>"
            + "<li>shot=[master shot id (one-based) in accordance with the TRECVID master shot reference (msb) (only for AVS tasks)]</li>"
            + "</ul><br>"

            + "An exemplary submission URI could look like this: "
            + "<p>http://demo2.itec.aau.at:80/vbs/submit?team=3&member=1&video=1234&frame=4321</p>"
            + "or like this (alternative optional format for AVS tasks): "
            + "<p>http://demo2.itec.aau.at:80/vbs/submit?team=3&member=2&video=2345&shot=13</p>"

            + "<br><b>Important notes:</b><ul>"
            + "<li>All parameters should be Integers (only for video ids the server will be tolerant and also accept ids with zero padding and/or file suffix, e.g., 01234.mp4)</li>"
            + "<li>'team' and 'video' are mandatory for every task</li>"
            + "<li>For KIS tasks, 'frame' is required, 'shot' is ignored</li>"
            + "<li>For AVS tasks, both 'frame' and 'shot' are supported</li>"
            + "<li>The videos have different framerates, so be careful in case you need to convert timecodes to frame numbers</li>"
            + "<li>At the actual competition, the url and port will be different, so please make sure you can easily change the server address and port</li>"
            + "<li>An internet connection will be available, but be aware that using a VPN will not be possible since then you won't have access to the VBS server</li>"
            + "<li>Team Ids are as follows:"
            + "<ol>"
            + "<li>VITRIVR</li>"
            + "<li>VIREO</li>"
            + "<li>VERGE</li>"
            + "<li>VIRET</li>"
            + "<li>VISIONE</li>"
            + "<li>ITEC</li>"
            + "</ol></li></ul>"

            + "<br><b>Action Logging:</b><br>"
            + "Last year we introduced a rudimental interaction logging, so we can perform a more detailed analysis after the competition.<br>"
            + "At VBS 2019, we refined the logging mechanism as follows:"
            + "<ul>"
            + "<li>Interaction logs are now sent as body of the HTTP POST request</li>"
            + "<li>They have to be encoded as JSON and should adhere to the agreed format that all teams received </li>"
            + "<li>If you issue multiple submissions during a task, always clear the log sequence after each submission to avoid unnecessary redundancy (no cumulative logging!).</li>"
            + "<li>A log message is usually sent in combination with an actual submission, but can also be sent independently of a submission (in case the target scene was not found). In that case, simply do not specify a video and frame/shot in the URL parameters</li>"
            + "<li>Log messages are also accepted after a task has ended (but don't forget to send it!)</li>"
            + "</ul>"

            + "<br><b>Test scene:</b>"
            + "<br>For testing purposes, please try to find one of the following scenes (one textual, one visual) and submit your answer according to the instructions above.<br>"
            + "The response will tell you if the submission is correct. If it is wrong, it provides additional information about what is wrong.<br>"
            + "Also don't forget to include an interaction log in the HTTP POST body.<br><br>"

            + "<h3>Scene 1 (Textual)</h3>"
            + "<p style='color: red; font-size: larger; font-style: italic; margin-left: 60px;'>A man with two boys entering a comic book store, they are greeted by the owner. People inside and outside the store cheering.<br>"
            + "A group of boys wearing blue Dodgers and Royals shirts.<br>"
            + "The store owner wears black and has grey hair.</p>"

            + "<h3>Scene 2 (Visual)</h3>"
            + "<video muted autoplay loop controls><source src='/vbs/demo_2019.mp4'></source></video>"
            + "<br><br> <i>Bernd Münzer, ITEC, Klagenfurt University, 2016-2018</i>"

            + "</body></html>"
            );

});

// submission format:  <serveraddress:port>/submit?team=<int>&video=<int>&frame=<int>&shot=<int>&iseq=<string>
// 2019 test clip:
// visual: video 6555, frame 4150 - 4650
// textual: video 12, frame 1588 - 1918
// 2018 test clip:
// video 38956 ClaudeBesson-festival2008LaroquebrouMonteeDuChateau257-2._-o-_.ClaudeBesson-festival2008LaroquebrouMonteeDuChateau257_512kb
// frame 1675 - 2175(1:07 - 1:27)
// old test clip:
// video 38988 (Pickup_Hockey_Winter_Wednesday_17Dec2008._-o-_.SSA50048_512kb)
// frame 11326 - 11926 ( 6:17 - 6:47)
// GET is deprecated, we now use POST
/*app.get('/submit', function (req, res) {

    // parse parameters
    var url_parts = url.parse(req.url, true);
    var query = url_parts.query;
    var teamId = parseInt(query.team);
    var videoId = parseInt(query.video);
    var framenumber = parseInt(query.frame);
    var shotId = parseInt(query.shot);
    var iseq = query.iseq;

    handleSubmission(teamId, videoId, framenumber, shotId, iseq, req, res, "GET");

});
*/
app.get('/submit', function (req, res) {
    res.send("GET is not used anymore for submissions. Please send a POST request!")
});

// returns true if this client sent at least num requests in the last s seconds
function checkClientMap(ip, num, s) {
    if (clientMap[ip].length >= num) {
        if (Date.now() - clientMap[ip][clientMap[ip].length-num] < s*1000) {
            return true;
        }
    }
    return false;
}

app.post('/submit', function (req, res) {

    var submitTimeStamp = new Date(Date.now()).toLocaleString();

    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    // very rudimental protection against a hypothetical flooding attack:
    // if a client sends more than 10000 total requests or a lot of request in short time, we simply ignore it (and don't write to log!)
    if (!clientMap[ip]) {
        clientMap[ip] = [];
    }

    if (clientMap[ip].length > 10000 || checkClientMap(ip, 5, 1) || checkClientMap(ip, 100, 10) || checkClientMap(ip, 1000, 60)) {
        res.send("Error: too many requests!");
        return;
    }
    clientMap[ip].push(Date.now());

    // submission data is sent as URL parameters
    var url_parts = url.parse(req.url, true);
    var query = url_parts.query;
    var teamNumber = parseInt(query.team);
    var memberNumber = parseInt(query.member);
    var videoNumber = parseInt((""+query.video).split(".")[0]);
    var frameNumber = parseInt(query.frame);
    var shotNumber = parseInt(query.shot);

    // action log can be sent as JSON encoded body (but is optional)
    var actionLog = req.body;

    var response = "";

    if (!teamNumber) {
        response += "Missing team id. ";
    }
    if (teamNumber < 1 || teamNumber > 6) {
        response += "Invalid team id (" + query.team + "). ";
    }

    if (!memberNumber) {
        response += "Missing member id. ";
    }

    if (!videoNumber) {
        response += "Missing video id. ";
    } else if (videoNumber != 6555 && videoNumber != 12) {
//    } else if (videoId != 38988) {
        response += "Wrong video id (" + query.video + "). ";
    }

    if (!isNumeric(frameNumber)) {
        response += "No frame specified. ";
    } else {
        if (videoNumber == 12) {
            if (frameNumber < 1588 || frameNumber > 1918) {
        //    } else if (framenumber < 11326 || framenumber > 11926){
                response += "Wrong frame number (" + frameNumber + "). ";
            }
        } else if (videoNumber == 6555) {
            if (frameNumber < 4150 || frameNumber > 4650) {
                response += "Wrong frame number (" + frameNumber + "). ";
            }
        }
    }

    if (response === "") {  // no error
        response = "Correct!";
    }

    if (!actionLog || typeof actionLog !== "object" || Object.keys(actionLog).length == 0) {
        response += " Please also include your action Log!";
    } else {
        response += " Action log: " + JSON.stringify(actionLog);
    }

//    if (iseq === null || iseq === undefined || iseq === "") {
//        response += " Please also include your sequence of actions for a detailed analysis!";
//    }

    res.send(response);

    var header = "submitTimeStamp;IP;team;member;video;frame;shot;actionLog;response";

    var logEntry = submitTimeStamp
        + ";" + ip
        + ";" + teamNumber
        + ";" + memberNumber
        + ";" + videoNumber
        + ";" + frameNumber
        + ";" + shotNumber
        + ";" + JSON.stringify(actionLog)
        + ";" + response;

    if (!fs.existsSync("submissionLog.csv")) {
        fs.appendFileSync("submissionLog.csv", header + "\n");
    }
    fs.appendFileSync("submissionLog.csv", logEntry + "\n");
    console.log(logEntry);

});





app.get('/lsc', function (req, res) {
    res.send("<h2>Welcome to the LSC 2018 Test Server</h2>"
            + "Submissions at the competition will be sent in the form of simple HTTP requests containing your team id and the id of an image belonging to the sought scene.<br>"
            + "For preliminary testing purposes please use the following URI: "
            + "<br><br>http://demo2.itec.aau.at:80/vbs/lsc/submit"
            + "<br><br> with the following parameters:"
            + "<ul>"
            + "<li>team=[your (numerical) team id, i.e. a number in the range 1-6]</li>"
            + "<li>image=[id of the submitted image, e.g. 20160815_145016_000.jpg]</li>"
            + "</ul>"
            + "An exemplary submission could look like this: "
            + "<p>http://demo2.itec.aau.at:80/vbs/lsc/submit?team=3&image=20160815_145016_000.jpg</p>"
            + "<b>Important notes:</b><ul>"
            + "<li>At the actual competition, the url will be different, so please make sure you can easily change the server address as well as the port and path!</li>"
            + "<li>Team Ids are as follows: "
            + "<ol>"
            + "<li>AAU - Alpen-Adria University</li>"
            + "<li>SIRET - SIRET Research Group, Charles University</li>"
            + "<li>DCU - Dublin City University</li>"
            + "<li>UUDCU - University Utrecht / Dublin City University</li>"
            + "<li>VNU - Vietnam National University </li>"
            + "<li>UPCDCU - Universitat Politècnica de Catalunya / Dublin City University</li>"
            + "</ol></li></ul>"
            + "<br>For testing purposes, try to find the following image and submit your answer according to the instructions above.<br>"
            + "The response will tell you if the submission is correct. If it is wrong, it provides additional information about what is wrong.<br><br>"
            + "<img width='400' src='lsc_example.jpg'/>"
            + "<br><br> <i>Bernd Münzer, ITEC, Klagenfurt University, 2018</i>"
            );

});



var lscTeams = [
    "AAU - Alpen-Adria University",
    "SIRET - SIRET Research Group, Charles University",
    "DCU - Dublin City University",
    "UUDCU - University Utrecht / Dublin City University",
    "VNU - Vietnam National University",
    "UPCDCU - Universitat Politècnica de Catalunya / Dublin City University"
];

// submission format:  <serveraddress:port>lsc/submit?team=<int>&image=<string>
// test image: 20160819_160610_000.jpg
app.get('/lsc/submit', function (req, res) {

    // parse parameters
    var url_parts = url.parse(req.url, true);
    var query = url_parts.query;
    var teamId = query.team;
    var imageId = query.image;

    var submitTimeStamp = new Date(Date.now()).toLocaleString();

    var response = "";

    if (!teamId) {
        response += "Missing team id. ";
    }
    if (!isNumeric(teamId) || teamId < 1 || teamId > 6) {
        response += "Invalid team id (" + teamId + "). ";
    }

    if (!imageId) {
        response += "Missing image id. ";
    } else if (imageId !== "20160819_160610_000.jpg") {
        response += "Wrong image id (" + imageId + "). ";
    }

    if (response === "") {  // no error
        response = "Correct answer from team " + lscTeams[teamId - 1];
    }

    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    fs.appendFileSync("submissionLog_lsc.csv",
            submitTimeStamp + ";" + ip
            + ";teamId:" + teamId
            + ";imageId:" + imageId
            + ";" + response + "\n");

    res.send(response);

});






app.get('/aau', function (req, res) {
    res.send("<h2>Welcome to the Video Retrieval Test Server</h2>"
            + "To submit a result please send an HTTP GET request to the following URI:"
            + "<br><br>http://demo2.itec.aau.at:80/vbs/aau/submit"
            + "<br><br> with the following parameters:"
            + "<ul>"
            + "<li>team=[your team id (1-3)]</li>"
            + "<li>video=[id of the video according to the TRECVID 2016 data set (35345-35780)]</li>"
            + "<li>frame=[zero-based frame number (this frame must be <u>within</u> the target segment in order to be rated as correct)]</li>"
            + "</ul><br>"
            + "<b>Important notes:</b><ul>"
            + "<li>The videos have different framerates, so be careful in case you need to convert timecodes to frame numbers.</li>"
            + "<li>At the actual competition, the url, port and path will be different, so please make sure you can easily change them.</li>"
            + "<li>Team Ids are as follows: "
            + "<ol>"
            + "<li>Students 1 (4 persons)</li>"
            + "<li>Students 2 (3 persons)</li>"
            + "<li>ITEC</li>"
            + "</ol></li></ul>"
            + "An exemplary submission could look like this: "
            + "<p>http://demo2.itec.aau.at:80/vbs/aau/submit?team=3&video=35678&frame=2435</p>"
            + "<br><br>For testing purposes, please try to find the following scene and submit your answer according to the instructions above.<br>"
            + "The response will tell you if the submission is correct. If it is wrong, it provides additional information about what is wrong.<br><br>"
            + "<video autoplay loop ><source src='/vbs/demo_aau.mp4'></source></video>"
            + "<br><br> <i>Bernd Münzer, ITEC, Klagenfurt University, 2016-2018</i>"
            );

});



// submission format:  <serveraddress:port>aau/submit?team=<int>&video=<int>&frame=<int>
// test clip:
// video 35763  mtproduct._-o-_.SOCCER_MANIAClow_512kb.mp4
// frame 2063 - 2562
app.get('/aau/submit', function (req, res) {

    // parse parameters
    var url_parts = url.parse(req.url, true);
    var query = url_parts.query;
    var teamId = parseInt(query.team);
    var videoId = parseInt(query.video);
    var framenumber = parseInt(query.frame);

    var submitTimeStamp = new Date(Date.now()).toLocaleString();

    var response = "";

    if (!teamId) {
        response += "Missing team id. ";
    }
    if (teamId < 1 || teamId > 3) {
        response += "Invalid team id (" + teamId + "). ";
    }

    if (!videoId) {
        response += "Missing video id. ";
    } else if (videoId != 35763) {
        response += "Wrong video id (" + videoId + "). ";
    }

    if (!framenumber) {
        response += "No frame specified. ";
    } else if (framenumber < 2063 || framenumber > 2562) {
        response += "Wrong frame number (" + framenumber + "). ";
    }

    if (response === "") {  // no error
        response = "Correct!";
    }

    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    fs.appendFileSync("submissionLog_aau.csv",
            submitTimeStamp + ";" + ip
            + ";teamId:" + teamId
            + ";videoId:" + videoId
            + ";frame:" + framenumber
            + ";" + response + "\n");

    res.send(response);

});




function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

// *******************************************************************************************************
// Start Server Listening ********************************************************************************
// *******************************************************************************************************
//app.listen(3100);    // not necessary because server "wraps" app, so we can use the same port!?
server.listen(3100);

console.log("SERVER running");
