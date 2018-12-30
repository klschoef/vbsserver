var control;
$(document).ready(function () {
    console.log("ready");
    control = new Control();
});

class Control {
    constructor() {

        this.competitions = [];
        this.tasks = [];

        // at each time, at most one competition is active (tasks are shown)
        this.activeCompetition;

        this.socket = new ClientSockets({clientType: "admin"}, () => {
            this.init(() => {
                console.log("initialized");
            })
        });

    }

    init(callback) {
        // init Toast generator
        toastr.options = {
            "closeButton": true,
            "debug": false,
            "newestOnTop": false,
            "progressBar": true,
            "positionClass": "toast-top-right",
            "preventDuplicates": false,
            "onclick": null,
            "showDuration": "300",
            "hideDuration": "1000",
            "timeOut": "5000",
            "extendedTimeOut": "1000",
            "showEasing": "swing",
            "hideEasing": "linear",
            "showMethod": "fadeIn",
            "hideMethod": "fadeOut"
        };

        $("#taskPreview").draggable();

        this.socket.registerEvent("countdown", (time) => {
            toastr.info("Task starts in " + time + " seconds");
        });

        // task is stopped automatically when
        //  - time is over
        //  - all teams are successful (only KIS tasks)
        this.socket.registerEvent("stopTask", (data) => {
            toastr.info("Task stopped");
            this.refreshTasks();
        });

        this.socket.registerEvent("remainingTime", (data) => {
            var timeString = "Remaining Time: " + this.formatTime(data.time);
            $(".taskRunning").children(".remainingTime").html(timeString);
        });

        var promises = [];
        promises.push(this.loadVideoMap());
        promises.push(this.refreshCompetitions());
        Promise.all(promises).then(() => {
            callback();
        });

    }

    loadVideoMap() {
        return new Promise((resolve, reject) => {
            // request videoMap (for computing playback times)
            this.socket.emit("getVideoMap", {skipShots: true}, (response) => {
                if (response.success) {
                    this.videoMap = response.data;
                    resolve();
                } else {
                    console.err("couldn't load video map from server");
                    reject();
                }
            });
        });
    }

    unload() {
        this.socket.disconnect();
    }

    // page is build dynamically using templates,
    // which rendered using this method
    // finally, the result is appended to the given target
    renderTemplate(templateId, data, target) {
        var template = document.getElementById(templateId).innerHTML;
        var output = Mustache.render(template, data);
        $(target).append(output);
    }

    startCompetition(competitionId) {
        this.socket.emit("startCompetition", {competitionId: competitionId}, (response) => {
            if (response.success) {
                toastr.success("Competition Started");
                this.refreshCompetitions();
            } else {
                toastr.error("Competition could not be started: " + response.data);
            }
        });
    }

    stopCompetition() {
        $.confirm({
            title: 'Stop Competition',
            content: "Do you really want to stop this competition? "
                    + "After stopping, no more tasks can be started or edited!",
            theme: "dark",
            boxWidth: '300px',
            useBootstrap: false,
            buttons: {
                stop: () => {
                    this.socket.emit("stopCompetition", {}, (response) => {
                        if (response.success) {
                            toastr.success("Competition Stopped");
                            this.refreshCompetitions();
                        } else {
                            toastr.error("Competition could not be stopped: " + response.data);
                        }
                    });
                },
                cancel: () => {
                    // nothing to do
                }
            }
        });
    }

    startTask(taskId) {
        this.socket.emit("startTask", {taskId: taskId}, (response) => {
            if (response.success) {
                toastr.success("Task Started");
                this.refreshTasks();
            } else {
                toastr.error("Task could not be started: " + response.data);
            }
        });
    }

    stopTask() {
        this.socket.emit("stopTask", {}, (response) => {
            if (response.success) {
                toastr.success("Task Stopped");
//                this.refreshTasks();  // is already triggered by stopTask event from server
            } else {
                toastr.error("Task could not be stopped: " + response.data);
            }
        });
    }

    resetTask(taskId) {
        $.confirm({
            title: 'Reset Task',
            content: "Do you really want to reset this task? "
                    + "This will also delete all other associated data (submissions and taskResults)",
            theme: "dark",
            boxWidth: '300px',
            useBootstrap: false,
            buttons: {
                reset: () => {
                    this.socket.emit("resetTask", {taskId: taskId}, (response) => {
                        if (response.success) {
                            toastr.success("Task was reset");
                        } else {
                            toastr.error("Something went wrong when trying to reset task: " + response.data);
                        }
                        this.refreshTasks();
                    });
                },
                cancel: () => {
                    // nothing to do
                }
            }
        });
    }

    taskPreview(taskId, event) {
        var task = this.listToMap(this.tasks)[taskId];
        $("#taskText").html(JSON.stringify(task, null, 2));
        $("#taskPreview").fadeIn("slow");

        var video = $("#previewVideo")[0];
        if (task.type.startsWith("KIS")) {
            var videoNumber = task.videoRanges[0].videoNumber;
            var videoFile = this.videoMap[videoNumber].filename;
            var fps = this.videoMap[videoNumber].fps;
            var startTime = task.videoRanges[0].startFrame / fps;
            var endTime = task.videoRanges[0].endFrame / fps;
            video.src = config.server.videoDir + "/" + videoFile;
            video.ontimeupdate = () => {
                if (video.currentTime < startTime || video.currentTime > endTime) {
                    video.currentTime = startTime;
                }
            };
            $(video).show();
        } else {
            video.src = "";
            $(video).hide();
        }

        $("#taskText").height($("#taskText")[0].scrollHeight);
        var left = Math.max(0, Math.min(event.pageX - $("#taskPreview").width() / 2, $(document).width() - $("#taskPreview").width()));
        var top = Math.max(0, Math.min(event.pageY - $("#taskPreview").height() / 2, $(document).height() - $("#taskPreview").height()));
        $("#taskPreview").css("left", left + "px");
        $("#taskPreview").css("top", top + "px");
    }

    closePreview() {
        $("#previewVideo")[0].src = "";
        $("#previewVideo")[0].pause();
        $("#taskPreview").fadeOut();
    }

    competitionSelected(competition) {
        if (!this.activeCompetition || competition._id !== this.activeCompetition._id) {
            console.log("selected " + competition.name);
            this.activeCompetition = competition;
            var div = this.getCompetitionDiv(competition._id);
            $(".competitionInfo").hide();
            this.refreshTasks().then(() => {
                this.refreshTeams().then(() => {
                    $(div).children(".competitionInfo").show();
                    this.closePreview();
                });
            });
        }
    }

    refreshCompetitions() {
        return new Promise((resolve, reject) => {
            this.socket.emit("loadCompetitions", {}, (response) => {
                if (response.success) {
                    console.log("refreshed competitions");
                    $("#competitionsContainer").empty();
                    this.competitions = response.data.sort(this.compare);
                    if (this.competitions.length == 0) {
                        $("#competitionsContainer").html("<h1>No Competitions found...</h1>")
                    } else {
                        for (var i = 0; i < this.competitions.length; i++) {
                            this.createCompetitionDiv(this.competitions[i]);
                        }
                        // if a competition was selected before, re-select it
                        if (this.activeCompetition) {
                            var tmp = this.activeCompetition;
                            this.activeCompetition = null;
                            // but the current object is outdated and has to be replaced by the new version
                            for (var i = 0; i < this.competitions.length; i++) {
                                if (this.competitions[i]._id === tmp._id) {
                                    this.competitionSelected(this.competitions[i]);
                                    break;
                                }
                            }
                        } else {
                            // check if there is a running competition (there can only be one at each time) and select it
                            for (var i = 0; i < this.competitions.length; i++) {
                                if (this.competitions[i].running) {
                                    this.competitionSelected(this.competitions[i]);
                                    break;
                                }
                            }
                        }
                    }
                    resolve();
                } else {
                    toastr.error("refreshing competitions failed");
                    reject();
                }
            });
        });
    }

    refreshTasks() {
        return new Promise((resolve, reject) => {
            this.socket.emit("loadTasks", {competitionId: this.activeCompetition._id}, (response) => {
                if (response.success) {
                    console.log("refreshed tasks");
                    $(".taskContainer").children(".taskDiv").remove();  // hide tasks of previously selected competition
                    this.tasks = response.data.sort(this.compare);
                    for (var i = 0; i < this.tasks.length; i++) {
                        this.createTaskDiv(this.tasks[i]);
                    }
                    resolve();
                } else {
                    console.log("loading tasks failed");
                    toastr.error("loading tasks failed");
                    reject();
                }
            });
        });
    }

    refreshTeams() {
        return new Promise((resolve, reject) => {
            this.socket.emit("loadTeams", {competitionId: this.activeCompetition._id}, (response) => {
                if (response.success) {
                    console.log("refreshed teams");
                    $(".teamContainer").children(".teamDiv").remove();  // hide teams of previously selected competition
                    // sort by teamNumber
                    var teams = response.data.sort((a, b) => a.teamNumber - b.teamNumber);
                    for (var i = 0; i < teams.length; i++) {
                        this.createTeamDiv(teams[i]);
                    }
                    resolve();
                } else {
                    console.log("loading teams failed");
                    toastr.error("loading teams failed");
                    reject();
                }
            });
        });
    }

    createCompetitionDiv(competition) {
        this.renderTemplate("competitionTemplate", {
            competition: competition,
            startTime: new Date(competition.startTimeStamp).toLocaleString("de"),
            endTime: new Date(competition.endTimeStamp).toLocaleString("de")
        }, $("#competitionsContainer"));
        var div = this.getCompetitionDiv(competition._id);
        if (competition.finished) {
            $(div).addClass("competitionFinished");
        } else if (competition.running) {
            $(div).addClass("competitionRunning");
        }
        $(div).children(".header").on("click", () => {
            this.competitionSelected(competition);
        });
    }

    createTaskDiv(task) {
        var parentDiv = this.getCompetitionDiv(task.competitionId).children(".taskContainer");
        this.renderTemplate("taskTemplate", {
            task: task,
            startable: this.activeCompetition.running && !task.running && !task.finished,
            startTime: new Date(task.startTimeStamp).toLocaleString("de"),
            endTime: new Date(task.endTimeStamp).toLocaleString("de")},
                parentDiv);
        var div = this.getTaskDiv(task._id)[0];
        if (task.finished) {
            $(div).addClass("taskFinished");
        } else if (task.running) {
            $(div).addClass("taskRunning");
        }
    }

    createTeamDiv(team) {
        var parentDiv = this.getCompetitionDiv(team.competitionId).children(".teamContainer");
        this.renderTemplate("teamTemplate", team, parentDiv);
        var div = this.getTeamDiv(team._id);
        $(div).css("border", "4px solid " + team.color);
//        $(div).css("background", team.color);
    }

    getCompetitionDiv(competitionId) {
        return $("#competition_" + competitionId);
    }

    getTaskDiv(competitionId) {
        return $("#task_" + competitionId);
    }

    getTeamDiv(teamId) {
        return $("#team_" + teamId);
    }

    // re-arrange data as associative array mapping _id to object (for easier access)
    listToMap(list) {
        var map = {};
        for (var i = 0; i < list.length; i++) {
            map[list[i]._id] = list[i];
        }
        return map;
    }

    // first sort by running state, then by name
    compare(a, b) {
        var getOrder = (c) => {
            if (c.running)
                return 0;
            else if (c.finished)
                return 2;
            else
                return 1;
        }
        var ax = getOrder(a);
        var bx = getOrder(b);
        if (ax == bx) {
            if (ax == 2) {  // finished
                return a.startTimeStamp - b.startTimeStamp; // sort chronologically
            } else {
                return a.name.localeCompare(b.name);  // sort by name
            }
        }
        return ax - bx;
    }

    formatTime(seconds) {
        seconds = Math.round(Math.max(seconds, 0)); // don't go negative...
        var hours = Math.floor(seconds / 3600);
        seconds = seconds % 3600;
        var minutes = Math.floor(seconds / 60);
        var seconds = seconds % 60;

        if (hours < 10) {
            hours = '0' + hours;
        }
        if (minutes < 10) {
            minutes = '0' + minutes;
        }
        if (seconds < 10) {
            seconds = '0' + seconds;
        }
//        return hours + ':' + minutes + ':' + seconds;
        return minutes + ':' + seconds;
    }
}
