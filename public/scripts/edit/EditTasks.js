function taskEditor() {

    this.initVideoLoop = () => {
        // video loop over selected range
        var queryVideo = $("#queryVideo")[0];
        queryVideo.ontimeupdate = () => {
            if ($("#videoLoop").is(":checked")) {
                var task = this.activeTask();
                if (task) {
                    var range = task.videoRanges[0];
                    var startTime = range.startFrame / this.videoMap[range.videoNumber].fps;
                    var endTime = range.endFrame / this.videoMap[range.videoNumber].fps;
                    if (queryVideo.currentTime < startTime || queryVideo.currentTime > endTime) {
                        queryVideo.currentTime = startTime;
                    }
                }
            }
        };
    }

    this.activeTask = () => {
        if (this.activeTaskId && this.tasks[this.activeTaskId] && this.tasks[this.activeTaskId].competitionId === this.activeCompetitionId) {
            return this.tasks[this.activeTaskId];
        } else {
            return null;
        }
    }

    // loads a list of all tasks for the currently selected competition from the server
    // and fills the according selector
    // if previously a task had been selected, it is re-selected
    // (unless it has been deleted in the meantime)
    this.refreshTasks = () => {
        return new Promise((resolve, reject) => {
            if (!this.activeCompetition()) {    // if no competition is selected, don't load any tasks..
                this.resetTasks();
                resolve();
            } else {
                this.socket.emit("loadTasks", {competitionId: this.activeCompetitionId}, (response) => {
                    if (response.success) {
                        console.log("refreshed tasks");
                        this.tasks = this.listToMap(response.data);

                        // fill selector with options
                        $("#taskSelect").empty();
                        $("#taskSelect").append("<option value='none' disabled='disabled'>Select Task</option>");
                        var taskList = Object.values(this.tasks).sort((a, b) => a.name.localeCompare(b.name)); // sort by task name
                        for (var i = 0; i < taskList.length; i++) {
                            var task = taskList[i];
                            let option = document.createElement("option");
                            $(option).html(task.name);
                            option.value = task._id;
                            $("#taskSelect").append(option);
                        }

                        // refresh can also be triggered after some changes,
                        // so we re-select the previous value (unless that one has been deleted)
                        if (this.activeTask()) {
                            $("#taskSelect").val(this.activeTaskId);
                            this.taskSelected();
                        } else if (taskList.length > 0) {
                            $("#taskSelect").val(taskList[0]._id);
                            this.taskSelected();
                        } else {
                            $("#taskSelect").val('none');
                            this.resetCurrentTask();
                        }
                        resolve();
                    } else {
                        this.resetTasks();
                        console.log("loading tasks failed");
                        toastr.error("loading tasks failed");
                        reject();
                    }
                });
            }
        });
    }

    this.refreshActiveTask = () => {
        this.socket.emit("loadTask", {competitionId: this.activeCompetitionId, _id: this.activeTaskId}, (response) => {
            if (response.success) {
                var task = response.data;
                this.tasks[this.activeTaskId] = task;
                this.taskSelected();
            } else {
                toastr.error("refreshing task failed...");
                console.error("refreshing task failed...");
            }
        });
    }

    this.resetTasks = () => {
        this.activeTaskId = null;
        this.tasks = {};
        $("#taskSelect").empty();
        $("#taskBody").hide();
        $("#deleteTaskButton").hide();
    }

    this.resetCurrentTask = () => {
        this.activeTaskId = null;
        $("#taskBody").hide();
        $("#deleteTaskButton").hide();
    }

    this.taskSelected = () => {
        this.activeTaskId = $("#taskSelect :selected").val();
        var task = this.activeTask();

        if (task) {

            console.log("task selected: " + JSON.stringify(task));

            // fill task meta data (which is the same for all task types)
            $("#taskName").val(task.name);
            $("#taskSearchTime").val(task.maxSearchTime);
            $("#taskRunning").prop('checked', task.running);
            $("#taskFinished").prop('checked', task.finished);
            $("#taskTypeSelect").val(task.type ? task.type : "Select Task Type");

            this.taskTypeSelected();    // show according fields

            var video = null;
            var range = task.videoRanges[0];
            if (range) {
                video = this.videoMap[range.videoNumber];
            }

            if (video) {
                // fill KIS fields
                $("#kisVideoNumber").val(video.videoNumber);
                var segLength = ((range.endFrame - range.startFrame + 1) / video.fps).toFixed(3);
                $("#kisSegmentLength").val(segLength);
                $("#kisSegmentLength").attr("title", (range.endFrame - range.startFrame + 1) + " frames");
                $("#kisStartFrame").val(range.startFrame);
                $("#kisStartFrame").attr("title", this.formatTime(range.startFrame / video.fps));
                $("#kisEndFrame").val(range.endFrame);
                $("#kisEndFrame").attr("title", this.formatTime(range.endFrame / video.fps));
                $("#kisVideoName").html(video.filename);
                $("#kisVideoFps").val(video.fps);
//                $("#kisDuplicates").val(video.duplicates.join()); // TODO

                // load video
                if ($("#queryVideo")[0].src != config.server.videoDir + "/" + video.filename) {
                    $("#queryVideo")[0].src = config.server.videoDir + "/" + video.filename;
                }
            }

            // fill AVS fields
            $("#trecvidId").val(task.trecvidId);
            $("#avsQueryText").val(task.avsText);

            // fill LSC fields
            $("#lscImageText").val(task.imageList.join("\n"));

            // depending on the current state of the competition and task, modifications are allowed or not
            this.refreshAllowedActions();
            $("#taskBody").show();
        } else {
            $("#taskBody").hide();
            console.err("selecting task failed...");
        }
    }


    // when a new task is added, we create a random KIS_Visual task as default
    //  (so we always have a valid task object, otherwise the autosave policy would be problematic)
    // however, also all fields of the other task types are filled with default values
    this.addTaskButtonClicked = () => {

        this.socket.emit("randomVideo", {}, (response) => {
            if (response.success) {
                var randomVideo = response.data;
                var newTask;
                if (randomVideo) {
                    var rangeNumFrames = Math.round(config.task.KISDefaultLength * randomVideo.fps);
                    var startFrame = Math.round(Math.random() * (randomVideo.numFrames - rangeNumFrames));
                    var endFrame = startFrame + rangeNumFrames - 1;
                    newTask = {
                        competitionId: this.activeCompetitionId,
                        name: "Task " + (Object.keys(this.tasks).length + 1),
                        maxSearchTime: config.task.defaultSearchTime,
                        // by default, create a random KIS_Visual task
                        type: "KIS_Visual",
                        videoRanges: [{
                                videoId: randomVideo._id,
                                videoNumber: randomVideo.videoNumber,
                                startFrame: startFrame,
                                endFrame: endFrame
                            }], // TODO consider duplicates
                        textList: [{delay: 0, text: "Enter query text..."}],
                        trecvidId: "avs_" + this.randomId(10),
                        avsText: "Enter query text",
                        imageList: []
                    };
                } else {
                    // if no randomVideo can be found, we create a new LSC_Textual task by default
                    newTask = {
                        competitionId: this.activeCompetitionId,
                        name: "Task " + (Object.keys(this.tasks).length + 1),
                        maxSearchTime: config.task.defaultSearchTime,
                        // by default, create a random KIS_Visual task
                        type: "LSC_Textual",
                        videoRanges: [],
                        textList: [{delay: 0, text: "Enter query text..."}],
                        trecvidId: "avs_" + this.randomId(10),
                        avsText: "Enter query text",
                        imageList: ["Enter image names...", "image2", "image3", "..."]
                    };
                }
                this.createTask(newTask);
            } else {
                toastr.error("Internal server error.");
            }
        });
    }

    this.createTask = (newTask) => {
        this.socket.emit("createTask", newTask, (response) => {
            if (response.success) {
                toastr.success("New task created");
                var task = response.data;
                console.log(task);
                this.activeTaskId = task._id;   // select the new id (that we got from the server)
                $("#videoLoop").prop("checked", true);
                this.refreshTasks();
            } else {
                toastr.error("Server error: creating tasks failed: " + response.data);
            }
        });
    }

    this.randomId = (length) => {
        var text = "";
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (var i = 0; i < length; i++)
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        return text;
    }

    this.deleteTaskButtonClicked = () => {
        var task = this.activeTask();
        if (!task) {
            toastr.error("No task selected");
        } else {
            $.confirm({
                title: 'Delete task',
                content: "Do you really want to delete this task?",
                theme: "dark",
                boxWidth: '300px',
                useBootstrap: false,
                buttons: {
                    delete: () => {
                        this.socket.emit("deleteTask", task, (response) => {
                            if (response.success) {
                                toastr.success("Task " + task.name + " was deleted");
                                this.refreshTasks();
                            } else {
                                toastr.error("Server error: deleting task failed: " + response.data);
                            }
                        });
                    },
                    cancel: () => {
                        // nothing to do
                    }
                }
            });
        }
    }

    this.updateTask = (task, refreshList) => {
        this.socket.emit("updateTask", task, (response) => {
            if (response.success) {
                toastr.success("Task updated");
            } else {
                toastr.error("Updating task failed: " + response.data);
            }
            if (refreshList) {
                this.refreshTasks();
            } else {
                this.refreshActiveTask();
            }
        });
    }

    // changed event is triggered when the text has changed and the input element looses focus
    this.taskNameChanged = () => {
        var task = this.activeTask();
        task.name = $("#taskName").val();
        this.updateTask(task, true);    // when the name changes, we have to refresh the entire task list (for dropdown box refresh)
    }

    this.taskSearchTimeChanged = () => {
        var task = this.activeTask();
        task.maxSearchTime = parseInt($("#taskSearchTime").val());
        this.updateTask(task);
    }

    this.taskTypeSelected = () => {
        var task = this.activeTask();
        if (task) {  // show the according fields
            if (task.type.startsWith("KIS_Visual")) {
                $("#kisQueryDiv").show();
                $("#kisTextualQueryDiv").hide();
                $("#avsQueryDiv").hide();
                $("#lscQueryDiv").hide();
                $("#queryVideo")[0].play();
            } else if (task.type.startsWith("KIS_Textual")) {
                this.buildTaskListDiv();
                $("#kisQueryDiv").show();
                $("#kisTextualQueryDiv").show();
                $("#avsQueryDiv").hide();
                $("#lscQueryDiv").hide();
                $("#queryVideo")[0].play();
            } else if (task.type.startsWith("AVS")) {
                $("#kisQueryDiv").hide();
                $("#kisTextualQueryDiv").hide();
                $("#avsQueryDiv").show();
                $("#lscQueryDiv").hide();
                $("#queryVideo")[0].pause();
            } else if (task.type.startsWith("LSC_Textual")) {
                this.buildTaskListDiv();
                $("#kisQueryDiv").hide();
                $("#kisTextualQueryDiv").show();
                $("#avsQueryDiv").hide();
                $("#lscQueryDiv").show();
                $("#queryVideo")[0].pause();
            }
        }
    }

    this.buildTaskListDiv = () => {
        var task = this.activeTask();
        $("#kisTextListContainer").empty();
        for (var i = 0; i < task.textList.length; i++) {
            var div = document.createElement("div");
            div.className = "kisTextListItem";
            var delayInput = document.createElement("input");
            delayInput.type = "number";
            delayInput.min = 0;
            delayInput.id = "kisTextDelay_" + i;
            $(delayInput).addClass("kisTextDelay");
            $(delayInput).addClass("taskConditionallyEnabled");
            delayInput.value = task.textList[i].delay;
            delayInput.onchange = this.kisQueryTextChanged.bind(this);
            var textInput = document.createElement("textarea");
            textInput.rows = 5;
            textInput.cols = 100;
            textInput.id = "kisText_" + i;
            $(textInput).addClass("kisText");
            $(textInput).addClass("taskConditionallyEnabled");
            textInput.value = task.textList[i].text;
            textInput.onchange = this.kisQueryTextChanged.bind(this);
            div.append("Delay: ", delayInput, textInput);
            $("#kisTextListContainer").append(div);
        }
        console.log(task.textList);
        if (task.textList.length <= 1) {
            $("#deleteKISTextBtn").hide();
        } else {
            $("#deleteKISTextBtn").show();
        }
    }

    this.taskTypeChanged = () => {
        var task = this.activeTask();
        task.type = $("#taskTypeSelect :selected").val();
        this.updateTask(task);
        this.taskTypeSelected();
    }

    this.kisVideoNumberChanged = () => {
        var video = this.videoMap[$("#kisVideoNumber").val()];
        if (video) {
            var task = this.activeTask();
            var rangeNumFrames = Math.round(config.task.KISDefaultLength * video.fps);
            var startFrame = Math.round(Math.random() * (video.numFrames - rangeNumFrames));
            task.videoRanges = [{
                    videoId: video._id,
                    videoNumber: video.videoNumber,
                    startFrame: startFrame,
                    endFrame: startFrame + rangeNumFrames - 1
                }];
            $("#videoLoop").prop("checked", true);
            this.updateTask(task);
            this.taskTypeSelected();
        } else {
            toastr.error("invalid video number")
            this.refreshActiveTask();
        }
    }

    this.kisRandomVideo = () => {
        this.socket.emit("randomVideo", {}, (response) => {
            if (response.success) {
                var randomVideo = response.data;
                var task = this.activeTask();
                var rangeNumFrames = Math.round(config.task.KISDefaultLength * randomVideo.fps);
                var startFrame = Math.round(Math.random() * (randomVideo.numFrames - rangeNumFrames));
                task.videoRanges = [{
                        videoId: randomVideo._id,
                        videoNumber: randomVideo.videoNumber,
                        startFrame: startFrame,
                        endFrame: startFrame + rangeNumFrames - 1
                    }];
                $("#videoLoop").prop("checked", true);
                this.updateTask(task);
                this.taskTypeSelected();
            }
        });
    }

    this.kisVideoSetStart = () => {
        var timeCode = $("#queryVideo")[0].currentTime;
        var task = this.activeTask();
        var range = task.videoRanges[0];
        var video = this.videoMap[range.videoNumber];
        range.startFrame = Math.round(timeCode * video.fps);
        range.endFrame = Math.round((timeCode + parseFloat($("#kisSegmentLength").val())) * video.fps) - 1;
        $("#videoLoop").prop("checked", true);
        this.updateTask(task);
    }

    this.kisSegmentLengthChanged = () => {
        var task = this.activeTask();
        var range = task.videoRanges[0];
        var video = this.videoMap[range.videoNumber];
        var startTime = range.startFrame / video.fps;
        range.endFrame = Math.round((startTime + parseFloat($("#kisSegmentLength").val())) * video.fps) - 1;
        $("#videoLoop").prop("checked", true);
        this.updateTask(task);
    }

    this.kisStartFrameChanged = () => {
        var task = this.activeTask();
        var range = task.videoRanges[0];
        var video = this.videoMap[range.videoNumber];

        var newStartFrame = parseInt($("#kisStartFrame").val());
        var segmentLength = Math.round(parseFloat($("#kisSegmentLength").val()) * video.fps);
        var newEndFrame = newStartFrame + segmentLength - 1;

        if (newEndFrame > video.numFrames) {
            newEndFrame = video.numFrames;
            newStartFrame = video.numFrames - segmentLength + 1;
        }
        range.startFrame = newStartFrame;
        range.endFrame = newEndFrame;
        $("#videoLoop").prop("checked", true);
        this.updateTask(task);
    }

    this.addKISText = () => {
        var task = this.activeTask();
        task.textList.push({
            delay: parseInt(task.textList[task.textList.length - 1].delay) + 1,
            text: "Enter query text"
        });
        this.updateTask(task);
    }

    this.deleteKISText = () => {
        var task = this.activeTask();
        task.textList.pop();
        this.updateTask(task);
    }

    this.kisQueryTextChanged = () => {
        var task = this.activeTask();
        var textList = [];
        var listLength = $(".kisTextDelay").length;
        for (var i = 0; i < listLength; i++) {
            textList.push({
                delay: parseInt($("#kisTextDelay_" + i).val()),
                text: $("#kisText_" + i).val()
            });
        }
        task.textList = textList;
        this.updateTask(task);
    }

    this.trecvidIdChanged = () => {
        var task = this.activeTask();
        task.trecvidId = $("#trecvidId").val();
        this.updateTask(task);
    }

    this.avsQueryTextChanged = () => {
        var task = this.activeTask();
        task.avsText = $("#avsQueryText").val();
        this.updateTask(task);
    }

    this.lscImageIdsChanged = () => {
        var task = this.activeTask();
        task.imageList = $("#lscImageText").val().split("\n");
        this.updateTask(task);
    }

    this.showImportTasks = () => {
//        $("#taskImportDiv").fadeIn();
        $("#taskImportFile").click(); // user does not have to click a second time...
    }

    this.hideImportTasks = () => {
//        $("#taskImportDiv").fadeOut();
    }

    this.importTasks = () => {
        var file = $("#taskImportFile")[0].files[0];
        if (file.name.endsWith(".xml")) {
            this.importTasksXML(file);
        } else if (file.name.endsWith(".json")) {
            this.importTasksJSON(file);
        } else {
            toastr.error("Invalid file");
        }
    }

    this.importTasksXML = (file) => {
      var reader = new FileReader();
      reader.onload = () => {
          var xml = $.parseXML(reader.result);
          var topics = $(xml).find("Topic");
          for (var i = 0; i < topics.length; i++) {
              var topic = topics[i];
              var duration = $(topic).attr("duration");
              var name = $(topic).find("TopicID")[0].textContent;

              var topicType = $(topic).find("TopicType")[0].textContent.toLowerCase();
              var taskType;
              if (topicType.includes("expert")) {
                  taskType = "LSC_Textual";
              } else if (topicType.includes("novice")) {
                  taskType = "LSC_Textual_novice";
              } else {
                  toastr.warning("Invalid TopicType '" + topicType + "' (must contain 'expert' or 'novice'");
                  continue;
              }

              var descriptions = $(topic).find("Description");
              var textList = [];
              for (var j = 0; j < descriptions.length; j++) {
                  var text = descriptions[j].textContent;
                  var timestamp = parseInt($(descriptions[j]).attr("timestamp"));
                  textList.push({delay: timestamp, text: text});
              }

              var imageIds = $(topic).find("ImageID");
              var imageList = [];
              for (var j = 0; j < imageIds.length; j++) {
                  imageList.push(imageIds[j].textContent);
              }

              var newTask = {
                  competitionId: this.activeCompetitionId,
                  name: name,
                  maxSearchTime: duration,
                  type: taskType,
                  videoRanges: [],
                  textList: textList,
                  trecvidId: "avs_" + this.randomId(10),
                  avsText: "Enter query text",
                  imageList: imageList
              };
              this.createTask(newTask);
          }

      }
      reader.readAsText(file);
    }

    // currently tailored to match deprecated json format from old server
    this.importTasksJSON = (file) => {
      var reader = new FileReader();
      reader.onload = () => {

          var json = JSON.parse(reader.result);
          if (Array.isArray(json)) {
              for (let i=0; i<json.length; i++) {
                var t = json[i];
                var newTask = {
                    competitionId: this.activeCompetitionId,
                    name: t.desc,
                    maxSearchTime: t.maxSearchTime,
                    type: t.type,
                    videoRanges: (t.type.startsWith("KIS")
                      ? [{videoId: null,
                        videoNumber: parseInt(t.videoId),
                        startFrame: t.startframe,
                        endFrame: t.endframe}]
                      : []),
                    textList: (t.type.startsWith("KIS") ? [{delay: 0, text: t.text}] : ""),
                    trecvidId: t.trecvidId ? t.trecvidId : "avs_" + this.randomId(10),
                    avsText: (t.type.startsWith("AVS") ? t.text : ""),
                    imageList: []
                };
                console.log(newTask);
                this.createTask(newTask);
              }
          }
      }
      reader.readAsText(file);
    }

    this.formatTime = (seconds) => {
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
