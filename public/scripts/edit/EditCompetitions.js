function competitionEditor() {

    this.activeCompetition = () => {
        return (this.activeCompetitionId) ? this.competitions[this.activeCompetitionId] : null;
    }

    // loads a list of all competitions from the server and fills the according selector
    // if previously a competition had been selected, it is re-selected 
    // (unless it has been deleted in the meantime)
    // returns a Promise
    this.refreshCompetitions = () => {
        return new Promise((resolve, reject) => {
            this.socket.emit("loadCompetitions", {}, (response) => {
                if (response.success) {
                    console.log("refreshed competitions");
                    this.competitions = this.listToMap(response.data);

                    // fill selector with options
                    $("#competitionSelect").empty();
                    $("#competitionSelect").append("<option value='none' disabled='disabled'>Select Competition</option>");

                    var competitionList = Object.values(this.competitions).sort((a, b) => a.name.localeCompare(b.name)); // sort by competition name
                    for (var i = 0; i < competitionList.length; i++) {
                        var competition = competitionList[i];
                        let option = document.createElement("option");
                        $(option).html(competition.name);
                        option.value = competition._id;
                        $("#competitionSelect").append(option);
                    }

                    // refresh can also be triggered after some changes, 
                    // so we re-select the previous value (unless that one has been deleted)              

                    if (this.activeCompetition()) {
                        $("#competitionSelect").val(this.activeCompetitionId);
                        this.competitionSelected();
                    } else if (competitionList.length > 0) {
                        $("#competitionSelect").val(competitionList[0]._id);
                        this.competitionSelected();
                    } else {
                        $("#competitionSelect").val('none');
                        this.resetCurrentCompetition();
                    }
                    resolve();
                } else {
                    toastr.error("refreshing competitions failed");
                    reject();
                }
            });
        });
    }

    this.resetCurrentCompetition = () => {
        this.activeCompetitionId = null;
        this.resetTasks();
        this.resetTeams();
        $("#competitionBody").hide();
    }

    this.competitionSelected = () => {
        this.activeTaskId = null;
        this.activeTeamId = null;
        this.activeCompetitionId = $("#competitionSelect :selected").val();
        var competition = this.activeCompetition();
        if (competition) {
            console.log("competition selected: " + JSON.stringify(competition));

            $("#competitionName").val(competition.name);
            $("#competitionStarted").prop('checked', competition.running || competition.finished);
            $("#competitionFinished").prop('checked', competition.finished);
            var startDate = "";

            if (competition.running || competition.finished) {
                startDate = new Date(competition.startTimeStamp).toLocaleString("de");
            }
            var endDate = "";
            if (competition.finished) {
                endDate = new Date(competition.endTimeStamp).toLocaleString("de");
            }
            $("#competitionStartTime").html(startDate);
            $("#competitionEndTime").html(endDate);
            $("#competitionBody").show();
            
            // depending on the current state of the competition, some modifications are allowed or not
            // (e.g., changing the name, delete, add teams etc.)
            this.refreshAllowedActions();
            
            this.refreshTasks();
            this.refreshTeams();
        } else {
            $("#competitionBody").hide();
            console.err("selecting competition failed...");
        }
    }

    this.addCompetitionButtonClicked = () => {
        var newCompetition = {
            name: "Competition " + (Object.keys(this.competitions).length + 1)
        };
        this.socket.emit("createCompetition", newCompetition, (response) => {
            if (response.success) {
                toastr.success("New competition created");
                var competition = response.data;
                console.log(competition);
                this.activeCompetitionId = competition._id;   // select the new id (that we got from the server)
                this.refreshCompetitions();
            } else {
                toastr.error("Server error: creating competition failed: " + response.data);
            }
        });
    }

    this.deleteCompetitionButtonClicked = () => {
        var competition = this.activeCompetition();
        if (!competition) {
            toastr.error("No competition selected");
        } else {
            $.confirm({
                title: 'Delete competition',
                content: "Do you really want to delete this competition? "
                        + "This will also delete all other associated data (tasks, teams, taskResults, submissions)",
                theme: "dark",
                boxWidth: '300px',
                useBootstrap: false,
                buttons: {
                    delete: () => {
                        // this also delete all other data associated with the deleted competition! (tasks, teams, taskResults, submissions)
                        this.socket.emit("deleteCompetition", competition, (response) => {
                            if (response.success) {
                                toastr.success("Competition " + competition.name + " was deleted");
                                this.refreshCompetitions();
                            } else {
                                toastr.error("Server error: deleting competition failed: " + response.data);
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

    this.cloneCompetitionButtonClicked = () => {
        this.socket.emit("cloneCompetition", this.activeCompetition(), (response) => {
            if (response.success) {
                toastr.success("Competition cloned");
                this.activeCompetitionId = response.data._id;
                this.refreshCompetitions();
            } else {
                toastr.error("Cloning competition failed: " + response.data);
            }
        });
    }

    this.updateCompetition = (competition) => {
        this.socket.emit("updateCompetition", competition, (response) => {
            if (response.success) {
                toastr.success("Competition updated");
            } else {
                toastr.error("Updating competition failed: " + response.data);
            }
            this.refreshCompetitions();
        });
    }

    // changed event is triggered when the text has changed and the input element looses focus
    this.competitionNameChanged = () => {
        var competition = this.activeCompetition();
        competition.name = $("#competitionName").val();
        this.updateCompetition(competition);
    }


    // refreshes the allowed add/delete/modify actions wrt. competition, tasks and teams
    this.refreshAllowedActions = () => {
        var competition = this.activeCompetition();
        var task = this.activeTask();

        if (competition.running) {
            // do not allow to delete a running competition
            $("#deleteCompetitionButton").hide();
            // once a competition is started, no teams can be added or deleted
            // also the teamNumber must not be changed any more (because it would have to be updated in all existing submissions)
            $("#addTeamButton").attr("disabled", true);
            $("#deleteTeamButton").attr("disabled", true);
            $("#presetTeamButton").attr("disabled", true);
            $("#teamNumber").attr("disabled", true);
            // it is allowed to add a new task to a running competition
            $("#addTaskButton").show();
            if (task) {
                // don't allow modification of a started task! (except task name)              
                if (task.running || task.finished) {
                    $(".taskConditionallyEnabled").attr("disabled", true);
                    $("#deleteTaskButton").hide();
                } else {
                    $(".taskConditionallyEnabled").attr("disabled", false);
                    $("#deleteTaskButton").show();
                }
            }

        } else if (competition.finished) {
            // if the competition is finished, deletion is ok
            $("#deleteCompetitionButton").show();
            // same as for running state
            $("#addTeamButton").attr("disabled", true);
            $("#deleteTeamButton").attr("disabled", true);
            $("#presetTeamButton").attr("disabled", true);
            $("#teamNumber").attr("disabled", true);
            // it makes no sense to add (or delete) a new task to a finished competition
            $("#addTaskButton").hide();
            $("#deleteTaskButton").hide();
            // don't allow any task modification any more (except task name)
            $(".taskConditionallyEnabled").attr("disabled", true);

        } else {
            // competition has not started yet -> everything is allowed
            $("#deleteCompetitionButton").show();
            // same as for running state
            $("#addTeamButton").attr("disabled", false);
            $("#deleteTeamButton").attr("disabled", false);
            $("#presetTeamButton").attr("disabled", false);
            $("#teamNumber").attr("disabled", false);
            // it makes no sense to add a new task to a finished competition
            $("#addTaskButton").show();
            if (task) {
                $("#deleteTaskButton").show();
                $(".taskConditionallyEnabled").attr("disabled", false);
            }

        }

    }


}