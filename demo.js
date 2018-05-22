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

app.get('/', function (req, res) {
    res.send("<h2>Welcome to the VBS 2018 Test Server</h2>"
            + "To submit a result please send an HTTP GET or POST request to the following URI:"
            + "<br><br>http://demo2.itec.aau.at:80/vbs/submit"
            + "<br><br> with the following parameters:"
            + "<ul>"
            + "<li>team=[your team id]</li>"
            + "<li>video=[id of the video according to the TRECVID 2016 data set (35345-39937)]</li>"
            + "<li>frame=[zero-based frame number (this frame must be <u>inside</u> the target segment in order to be rated as correct)]</li>"
            + "<li>shot=[master shot id (one-based) in accordance with the TRECVID master shot reference (msb) (only for AVS tasks)]</li>"
            + "<li>iseq=[sequence of actions that led to the submission, collected for logging purposes (see <a target='_blank' href='http://www.videobrowsershowdown.org/vbs/vbs2018-program/'>instructions</a>)]</li>"
            + "</ul><br>"
            + "<b>Important notes:</b><ul>"
            + "<li>'team' and 'video' are mandatory for every task</li>"
            + "<li>For KIS tasks, 'frame' is required, 'shot' is ignored</li>"
            + "<li>For AVS tasks, both 'frame' and 'shot' are supported</li>"
            + "<li>We strongly encourage you to also include the 'iseq' parameter in your submissions, so we can perform a more detailed analysis after the competition</>"
            + "<li>The server now also supports POST requests. In case of long Logging sequences, POST should be preferred over GET.</li>"
            + "<li>The videos have different framerates, so be careful in case you need to convert timecodes to frame numbers.</li>"
            + "<li>At the actual competition, the url and port will be different, so please make sure you can easily change the server address and port.</li>"
            + "<li>An internet connection will be available, but be aware that using a VPN will not be possible since then you won't have access to the VBS server.</li>"
            + "<li>Team Ids are as follows: (also see <a target='_blank' href='http://www.videobrowsershowdown.org/vbs/participating-teams'>VBS Homepage</a>)"
            + "<ol>"
            + "<li>VIREO</li>"
            + "<li>VITRIVR</li>"
            + "<li>ITEC1</li>"
            + "<li>ITEC2</li>"
            + "<li>VNU</li>"
            + "<li>SIRET</li>"
            + "<li>NECTEC</li>"
            + "<li>VERGE</li>"
            + "<li>HTW</li>"
            + "</ol></li></ul>"
            + "An exemplary submission could look like this: "
            + "<p>http://demo2.itec.aau.at:80/vbs/submit?team=3&video=35678&frame=2435&iseq=KCBBPFB</p>"
            + "or like this: "
            + "<p>http://demo2.itec.aau.at:80/vbs/submit?team=3&video=35678&shot=17</p>"
            + "<br><br>For testing purposes, please try to find the following scene and submit your answer according to the instructions above.<br>"
            + "The response will tell you if the submission is correct. If it is wrong, it provides additional information about what is wrong.<br><br>"
            + "<video autoplay loop ><source src='/vbs/demo.mp4'></source></video>"
            + "<br><br> <i>Bernd Münzer, ITEC, Klagenfurt University, 2016-2017</i>"
            );

});

// submission format:  <serveraddress:port>/submit?team=<int>&video=<int>&frame=<int>&shot=<int>&iseq=<string>
// test clip: 
// video 38956 ClaudeBesson-festival2008LaroquebrouMonteeDuChateau257-2._-o-_.ClaudeBesson-festival2008LaroquebrouMonteeDuChateau257_512kb
// frame 1675 - 2175(1:07 - 1:27)
// old test clip: 
// video 38988 (Pickup_Hockey_Winter_Wednesday_17Dec2008._-o-_.SSA50048_512kb)
// frame 11326 - 11926 ( 6:17 - 6:47)
app.get('/submit', function (req, res) {

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

app.post('/submit', function (req, res) {

    if (!req.body) {
        res.send("Missing body in POST request!");
        return;
    }


    // parse parameters
    var teamId = parseInt(req.body.team);
    var videoId = parseInt(req.body.video);
    var framenumber = parseInt(req.body.frame);
    var shotId = parseInt(req.body.shot);
    var iseq = req.body.iseq;

    handleSubmission(teamId, videoId, framenumber, shotId, iseq, req, res, "POST");

});

function handleSubmission(teamId, videoId, framenumber, shotId, iseq, req, res, method) {

    var submitTimeStamp = new Date(Date.now()).toLocaleString();

    var response = "";

    if (!teamId) {
        response += "Missing team id. ";
    }
    if (teamId < 1 || teamId > 9) {
        response += "Invalid team id (" + teamId + "). ";
    }

    if (!videoId) {
        response += "Missing video id. ";
    } else if (videoId != 38956) {
        //} else if (videoId != 38988) {
        response += "Wrong video id (" + videoId + "). ";
    }

    if (!framenumber) {
        response += "No frame specified. ";
    } else if (framenumber < 1675 || framenumber > 2175) {
//    } else if (framenumber < 11326 || framenumber > 11926){
        response += "Wrong frame number (" + framenumber + "). ";
    }

    if (response === "") {  // no error
        response = "Correct!";
    }

    if (iseq === null || iseq === undefined || iseq === "") {
        response += " Please also include your sequence of actions for a detailed analysis!";
    }

    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    fs.appendFileSync("submissionLog.csv",
            submitTimeStamp + ";" + ip + ";" + method
            + ";teamId:" + teamId
            + ";videoId:" + videoId
            + ";frame:" + framenumber
            + ";shotId:" + shotId
            + ";iseq:" + iseq
            + ";" + response + "\n");

    res.send(response);

}








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

// submission format:  <serveraddress:port>/submit?team=<int>&image=<string>
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
        response = "Correct answer from team " + lscTeams[teamId-1];
    }

    var ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    fs.appendFileSync("submissionLog_lsc.csv",
            submitTimeStamp + ";" + ip
            + ";teamId:" + teamId
            + ";imageId:" + imageId            
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
