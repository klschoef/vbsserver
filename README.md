# VBS Server

Official server of the annual [Video Browser Showdown ](http://www.videobrowsershowdown.org/).

## Prerequisites

* Server: node.js (at least v8.9.4)
* Client: Google Chrome (not tested yet with other browsers)

## Getting Started

* copy all files from "helper/testDatabase2020" to "database" to setup a sample database
* copy all video files of the dataset (in mp4 format and without subdirectories) to public/videos (or specify a remote URL in config)
* adapt config.json to suit your needs
	* enter the IP address of your server to "server.websocketURL" (don't use "localhost" but the actual IP!)
* start server: node app.js
* open Chrome browser and go to [serverIP]:[serverPort]  (don't use "localhost" but the actual IP!)

# Config

```
"server": {
	"port": 3100,	// used port
	"websocketURL": "192.168.0.1",	// URL of the server
	"videoDir": "videos/"	// directory or URL of the directory with all videos of the dataset
},
"client": {
	"extractorPoolSize": 4,		// number of HTML video elements used to extract thumbnails
	"playAudio": true,			// play sounds when submissions/judgements arrive (or not)
	"hideTeamNames": true,	// if the logos are expressive enough, additional teamNames are not necessary
	"initialFullscreenDuration": 20,	// when a task is started, the query is shown in fullscreen mode for <n> seconds
	"videoBlurProgress": {		// query video in KIS Visual tasks is progressively blurred accordingly
		"delay": [0, 40, 80, 120, 160, 200, 240, 280],		// delay in seconds
		"size": [0, 1, 2, 3, 4, 5, 6, 7]					// blur filter size (pixels)
	},
	"videoGrayscaleProgress": {		// moreover, colors are removed gradually
		"delay": [0, 40, 80, 120, 160, 180, 200, 220, 240, 260, 280],	// delay in seconds
		"percentage": [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]		// percentage for grayscale filter
	},
	"chartAspectRatio": 1.5		// aspect ratio of the results charts
},
"task": {
	"defaultSearchTime": 300,	// default search time for a new task
	"KISDefaultLength": 20,		// default target segment length for a new KIS task
	"KISFrameTolerance": 25,	// tolerance for KIS submissions (in frames)
	"KISMinScore": 50,			// score that would be achieved when submitting in the last second (without penalty)
	"KISPenalty": 5,			// penalty points per wrong submission
	"KISTimeTolerance": 5,		// if a correct submission arrives shortly before the deadline, the server waits for <n> seconds for further submissions
	"AVSRangeDuration": 120,	// maximum duration (in seconds) for a "range" in AVS tasks
	"countdownTime": 5			// time in seconds for countdown before task start
},
"debugMode": true	// enables or disables the test view
```

# Client Views

* edit: create and modify competitions, tasks and teams
* control: start/stop competitions and tasks
* viewer: shows the current state of the competition (query, submissions, results). the layout can be adapted by zooming the various GUI components with ALT + mousewheel
* judge: live judgement interface for AVS tasks
* test: allows to simulate a competition by generating random competitions and submissions. only available if debugMode is set to true
* inspect: post-hoc analysis of finished competitions (under construction)
* export: export database to csv (under construction)

## Authors

* **Bernd Münzer** - [Institute of Information Technology, Alpen-Adria-Universität Klagenfurt](http://www.uni-klu.ac.at/tewi/inf/itec/)
* **Klaus Schoeffmann** - [Institute of Information Technology, Alpen-Adria-Universität Klagenfurt](http://www.KlausSchoeffmann.com/)

## License

This project is licensed under the LGPL-3.0 License - see the [LICENSE.md](LICENSE.md) file for details
