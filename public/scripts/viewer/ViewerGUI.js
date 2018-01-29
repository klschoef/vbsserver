class ViewerGUI {

    constructor(viewer) {
        this.viewer = viewer;

        this.resultsGUI = new ResultsGUI(this);
        this.queryGUI = new QueryGUI(this);
        this.teamGUI = new TeamGUI(this);

        var zoomStep = 1.05;
        var zoomMin = 0.25;
        var zoomMax = 4;
        this.zoomWithMouseWheel("#queryVideo", zoomStep, zoomMin, zoomMax);
        this.zoomWithMouseWheel("#queryText", zoomStep, zoomMin, zoomMax);
        this.zoomWithMouseWheel("#timer", zoomStep, zoomMin, zoomMax);
        this.zoomWithMouseWheel("#teamContainer", zoomStep, zoomMin, zoomMax);
        this.zoomWithMouseWheel("#overallScore", zoomStep, zoomMin, zoomMax);
        this.zoomWithMouseWheel("#subScore", zoomStep, zoomMin, zoomMax);
        this.zoomWithMouseWheel("#avsExtraInfo", zoomStep, zoomMin, zoomMax);        
    }

    init() {
        this.teamGUI.init();
        this.queryGUI.init();
        this.resultsGUI.init();
        this.initZoom();
        this.showBody();
    }

    showBody() {
        $("#content").show();
    }

    initZoom() {
        var zoomKeys = Object.keys(localStorage).filter((k) => k.startsWith("vbs_zoom_"));
        for (var i = 0; i < zoomKeys.length; i++) {
            var key = zoomKeys[i];
            var id = key.substr("vbs_zoom_".length);
            this.zoomElement("#" + id, parseFloat(localStorage[key]));
            console.log("init zoom: " + id + " -> " + localStorage[key]);
        }
    }
    
    resetZoom() {
        var zoomKeys = Object.keys(localStorage).filter((k) => k.startsWith("vbs_zoom_"));
        for (var i = 0; i < zoomKeys.length; i++) {
            var key = zoomKeys[i];
            var id = key.substr("vbs_zoom_".length);
            this.zoomElement("#" + id, 1 / parseFloat(localStorage[key]));
            console.log("reset zoom: " + id + " -> 1");
        }
    }

    startTask() {
        this.teamGUI.resetThumbs();
        this.queryGUI.startTask();
        var task = this.viewer.getActiveTask();
        this.queryGUI.updateTimer(task.maxSearchTime);
        this.resultsGUI.updateAVSStatistics();
    }

    stopTask() {
        this.queryGUI.stopTask();
        // in Textual and AVS tasks, submissions are hidden during the task and only revealed afterwards 
        this.teamGUI.showAllSubmissions();
    }

    remainingTime(time) {
        this.queryGUI.updateTimer(time);
    }

    newSubmission(submission, playbackInfo) {
        this.teamGUI.addThumb(submission, playbackInfo);
    }

    newJudgement(submission) {
        this.teamGUI.updateSubmission(submission);        
    }
    
    updateAVSStatistics() {
        this.resultsGUI.updateAVSStatistics();
    }

    scoreUpdate() {
        this.teamGUI.updateScores();
        this.resultsGUI.updateScores();
    }

    hideLoadingAnimation() {
        $("#loadingDiv").fadeOut();
    }

    updateTitle(title) {
        $("#title").html(title);
    }

    // page is build dynamically using templates,
    // which rendered using this method
    // finally, the result is appended to the given target
    renderTemplate(templateId, data, target, prependFlag) {
        var template = document.getElementById(templateId).innerHTML;
        var output = Mustache.render(template, data);
        if (prependFlag) {
            $(target).prepend(output);
        } else {
            $(target).append(output);
        }
    }

    zoomWithMouseWheel(element, factor, min, max) {
        $(element).on("mousewheel", (event) => {
            if (event.altKey) {
                var currentZoom = parseFloat($(element).css("zoom"));
                if (event.originalEvent.deltaY < 0 && currentZoom * factor <= max) {
                    this.zoomElement(element, factor);
                } else if (event.originalEvent.deltaY > 0 && currentZoom / factor >= min) {
                    this.zoomElement(element, 1 / factor);
                }
                event.preventDefault();
            }
        });
    }

    zoomElement(element, factor) {
        if ($(element).length > 0) {
            var currentZoom = parseFloat($(element).css("zoom"));
            var targetZoom = currentZoom * factor;
            $(element).css("zoom", targetZoom);
            localStorage["vbs_zoom_" + $(element)[0].id] = targetZoom;
        }
    }

}