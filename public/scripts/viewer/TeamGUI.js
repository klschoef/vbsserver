class TeamGUI {

    constructor(gui) {
        this.gui = gui;
        this.viewer = gui.viewer;
        this.thumbZoom = 1;
    }

    init() {
        this.resetThumbs();
        this.initTeamDivs();
        this.updateScores();
    }

    getTeamDiv(teamId) {
        return $("#team_" + teamId)[0];
    }

    getThumbDiv(submissionId) {
        return $("#thumb_" + submissionId)[0];
    }

    initTeamDivs() {
        $("#teamContainer").empty();
        var teams = this.viewer.getTeams();
        for (var i = 0; i < teams.length; i++) {
            var team = teams[i];
            this.gui.renderTemplate("teamTemplate", teams[i], $("#teamContainer"));
            var div = this.getTeamDiv(team._id);
            $(div).css("background-color", this.addOpacity(team.color, 0.2));
            $(div).find(".teamBody").css("border", "4px solid " + team.color);
            $(div).find(".logoContainer").css("background", team.color);
            $(div).find(".teamScore").html("");
            $(div).find(".scoreDetails").html("");
            if (config.client.hideTeamNames) {
                $(div).find(".teamName").hide();
            }
            for (var submissionId in this.viewer.competitionState.submissions[team._id]) {
                var s = this.viewer.competitionState.submissions[team._id][submissionId];
                this.addThumb(s);
                this.updateSubmission(s);
            }
        }
        this.adaptThumbSize();
    }

    resetThumbs() {
        $(".thumbContainer").empty();
        $(".thumbOverlay").css("background-image", "url(../images/thumb_loading.png)");
        $(".thumbOverlay").css("background-color", "white");
        this.thumbZoom = 1;
        this.viewer.thumbManager.reset();    // cancel current extraction job
    }

    adaptThumbSize() {
        while (this.thumbZoom > 0.25 && ($(document).width() > $(window).width() || $(document).height() > $(window).height())) {
            this.thumbZoom *= 0.98;
            $(".thumbDiv").css("zoom", this.thumbZoom);
        }
    }

    addThumb(submission) {

        // create the thumbnail element
        var parent = $(this.getTeamDiv(submission.teamId)).find(".thumbContainer");
        this.gui.renderTemplate("thumbTemplate", submission, parent, true);
        var thumb = this.getThumbDiv(submission._id);
        this.updateSubmission(submission);

        // extract the corresponding frame
        var canvas = $(thumb).find(".thumbCanvas")[0];
        this.viewer.thumbManager.loadThumb(submission, canvas, () => {
            thumb.frameLoaded = true;
            this.updateSubmission(submission);
        });

        // link to video/image
        $(thumb).on("click", () => {
            window.open(this.viewer.thumbManager.getClickLink(submission), '_blank');
        });

        // adapt thumb zoom
        $(thumb).css("zoom", this.thumbZoom);
        this.adaptThumbSize();
    }

    // update appearance of the submission,
    // depending on task type and finished status
    updateSubmission(submission) {
        // we cannot rely on the submission object to be up-to-date
        //  e.g., the call after successful frame extraction passes a possibly outdated version
        var submission = this.viewer.getSubmission(submission.teamId, submission._id);

        var thumb = this.getThumbDiv(submission._id);
        thumb.title = this.viewer.thumbManager.getThumbTooltip(submission);

        var overlay = $(thumb).find(".thumbOverlay");

        // different task types require different behaviour
        var task = this.viewer.getActiveTask();

        if (task.finished) {
            // when the task is finished, everything can be shown
            $(overlay).css("background-image", "url(../images/thumb_show.png)");
            $(overlay).css("background-color", "transparent");
        } else {
            // for KIS, updateSubmission is called 2 times
            //  - newSubmission
            //  - thumb extracted
            if (task.type.startsWith("KIS_Visual")) {
                $(overlay).css("background-image", "url(../images/thumb_show.png)");
                $(overlay).css("background-color", "transparent");
            } else if (task.type.startsWith("KIS_Textual") || task.type.startsWith("LSC_Textual")) {
                if (submission.correct) {
                    $(overlay).css("background-image", "url(../images/thumb_correct.png)");
                } else {
                    $(overlay).css("background-image", "url(../images/thumb_wrong.png)");
                }
            } else if (task.type.startsWith("AVS")) {
                // for AVS, updateSubmission is called 3 times
                //  - newSubmission
                //  - thumb extracted
                //  - new judgement
                if (submission.judged) {
                    if (submission.correct) {
                        $(overlay).css("background-image", "url(../images/thumb_correct.png)");
                    } else {
                        $(overlay).css("background-image", "url(../images/thumb_wrong.png)");
                    }
                } else {
                    $(overlay).css("background-image", "url(../images/thumb_pending.png)");
                }
            }
        }

        if (submission.judged) {
            if (submission.correct) {
                $(thumb).removeClass("thumbPending");
                $(thumb).addClass("thumbCorrect");
            } else {
                $(thumb).removeClass("thumbPending");
                $(thumb).addClass("thumbWrong");
                // move wrong submission downwards
                // sorting order: pending > correct > wrong
                var topItems = $(thumb).parent().find(".thumbPending, .thumbCorrect");
                if (topItems.length > 0) {
                    $(thumb).detach().insertAfter(topItems.last());
                }
            }
        } else {
            $(thumb).addClass("thumbPending");
        }

        this.adaptThumbSize();
    }

    showAllSubmissions() {
        $(".thumbOverlay").css("background-image", "url(../images/thumb_show.png)");
        $(".thumbOverlay").css("background-color", "transparent");
    }

    updateScores() {
        var task = this.viewer.getActiveTask();
        var teams = this.viewer.getTeams();
        var teamOrder = [];
        for (var i = 0; i < teams.length; i++) {
            var team = teams[i];
            var div = this.getTeamDiv(team._id);
            if (task) {
                var teamResult = this.viewer.getCurrentTeamResult(team._id);
                $(div).find(".teamScore").html(Math.round(teamResult.taskScore));
                if (task.type.startsWith("AVS")) {
//                    $(div).find(".scoreDetails").html(teamResult.numCorrect + " / " + teamResult.numAttempts);
                    $(div).find(".scoreDetails").html(teamResult.numAttempts + " / "
                            + teamResult.numCorrect + " / "
                            + teamResult.numRanges + " / "
                            + teamResult.numVideos);
                } else {
                    $(div).find(".scoreDetails").html("");
                }
                // sort teams descending by task score. if taskScore is identical, use numAttempts as second criterion
                teamOrder.push({teamId: team._id, value: teamResult.taskScore, value2: teamResult.numAttempts});
            } else {
                $(div).find(".teamScore").html("");
                $(div).find(".scoreDetails").html("");
                // if no task is running, order by team number
                teamOrder.push({teamId: team._id, value: 100000 - team.teamNumber, value2: 0});  // to get a descending order
            }
        }
        teamOrder.sort((a, b) => {
            if (a.value == b.value) {
                return b.value2 - a.value2;
            } else {
                return b.value - a.value;
            }
        }); // sort descending
        this.rearrangeTeams(teamOrder);
    }

    // teamOrder is a sorted array of {teamId, value}
    rearrangeTeams(teamOrder) {
        for (var i = 0; i < teamOrder.length; i++) {
            $("#teamContainer").append($(this.getTeamDiv(teamOrder[i].teamId)).detach());
        }
    }

    addOpacity(color, opacity) {
        var r = parseInt("0x" + color.substr(1, 2));
        var g = parseInt("0x" + color.substr(3, 2));
        var b = parseInt("0x" + color.substr(5, 2));
        return "rgba(" + r + "," + g + "," + b + "," + opacity + ")";
    }

}
