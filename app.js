// // **************************************************************************************************
// Setup and configuration **************************************************************************
// **************************************************************************************************

// Module dependencies //////////////////////////
var dotenv = require('dotenv').config(), // set environment variables (e.g., production environment). must be done before creating express app!
        express = require('express'),
        app = express(),
//        bodyParser = require("body-parser"),  // deprecated in current express version
        server = require('http').createServer(app),
        io = require('socket.io')(server),
        fs = require('fs-extra'),
        logger = require('winston'),
        Session = require('express-session'),
        LokiStore = require('connect-loki')(Session),   // session store
        // Custom server modules
        Controller = require('./serverModules/Controller'),
        config = require('./config.json');

// Enable cross-origin resource sharing
app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
});

// enable POST submissions (with JSON encoded body)
//app.use(bodyParser.urlencoded());  // deprecated
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// handle JSON parse errors
app.use((error, req, res, next) => {
    if (error instanceof SyntaxError) {
        res.send("SyntaxError: " + error.type);
    } else {
        next();
    }
});

// use sessions (to remember that a user is already logged in)
var session = Session({
    store: new LokiStore({}),
    secret: "8lacmxjk",
    resave: true,
    saveUninitialized: true,
});

// make request object (which contains the session) available for websocket handler (because authentication is done over websocket)
io.use((socket, next) => {
    session(socket.request, socket.request.res, next);
});

app.use(session);


// Template engine
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');

// log HTTP requests on the console
//app.use(express.logger('dev'));

// serve static content
app.use(express.static(__dirname + '/public'));


// make sure that required directories exist
if (!fs.existsSync("log")){
    fs.mkdirSync("log");
    console.log("creating directory 'log'");
}

if (!fs.existsSync("database")){
    fs.mkdirSync("database");
    console.log("creating directory 'database'");
}
if (!fs.existsSync("public/images/logos/upload/")){
    fs.mkdirSync("public/images/logos/upload/");
    console.log("creating directory 'public/images/logos/upload/'");
}

// initialize logging
// logging levels:
//  error: 0,   -> console, vbslog, errorlog
//  warn: 1,    -> console, vbslog
//  info: 2,    -> console, vbslog
//  verbose: 3, -> vbslog
//  debug: 4,
//  silly: 5
logger.configure({
    transports: [
        new (logger.transports.Console)({
            level: "info"}),
        new (logger.transports.File)({
            name: "infoLog",
            filename: "log/vbsLog.log",
            level: "info"}),
        new (logger.transports.File)({
            name: "fullLog",
            filename: "log/vbsFullLog.log",
            level: "verbose",
            handleExceptions: true}),
        new (logger.transports.File)({
            name: "errorLog",
            filename: "log/vbsErrorLog.log",
            level: "error",
            handleExceptions: true})
    ]
});

logger.info("RESTARTING SERVER");

// Controller is a singleton object that handles all the application logic
// it can be required from any module
Controller.init(app, io);
server.listen(config.server.port);
