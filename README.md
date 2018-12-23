# VBS Server

Official server of the annual [Video Browser Showdown ](http://www.videobrowsershowdown.org/).

## Prerequisites

* Server: node.js (at least v8.9.4)
* Client: Google Chrome (not tested yet with other browsers)

## Getting Started

* copy helper/videos_v3c.db to database/videos.db in order to use the VBS 2019 dataset.
* copy the according video files to public/videos (or specify a remote URL in config)
* adapt config.json to suit your needs
* start server: node app.js

# Config

```
"server": {
	"port": 3100,	// used port
	"websocketURL": "localhost",	// URL of the server
	"videoDir": "videos/"	// directory or URL of the directory with all videos of the dataset
},
"client": {
	"extractorPoolSize": 4,		// number of HTML video elements used to extract thumbnails
	"playAudio": true,			// play sounds when submissions/judgements arrive (or not)
	"initialFullscreenDuration": 20,	// when a task is started, the query is shown in fullscreen mode for <n> seconds
	"videoBlurProgress": {		// query video in KIS Visual tasks is progressively blurred accordingly
		"delay": [0,60,90,120,150,180,200,220,240,260,280],
		"size": [0,1,2,3,4,5,6,7,8,9,10]
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
* inspect: post-hoc analysis of finished competitions (not implemented yet)
* export: export database to csv (not implemented yet)

## Authors

* **Bernd Münzer** - [Institute of Information Technology, Alpen-Adria-Universität Klagenfurt](http://www.uni-klu.ac.at/tewi/inf/itec/)


## License

This project is licensed under the LGPL-3.0 License - see the [LICENSE.md](LICENSE.md) file for details
