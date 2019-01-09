class ResultsGUI {

    constructor(gui) {
        this.gui = gui;
        this.viewer = gui.viewer;

        this.barChartOptions = {
            horizontalBars: true,
            axisX: {
                showLabel: true,
                showGrid: true,
                integerOnly: true,
                scaleMinSpace: 50,
                low: 0  // always start scale with 0 -> TODO: render chart scale dynamically
            },
            axisY: {
                showLabel: true,
                showGrid: false,
                integerOnly: true
            },
            chartPadding: {
                top: 15,
                right: 30,
                bottom: 5,
                left: 30
            },
            width: 320 * config.client.chartAspectRatio, // without absolute size, zoom does not work!
            height: 320,
            referenceValue: null, // null for auto
            plugins: [
                Chartist.plugins.ctBarLabels({
                    labelClass: 'ct-label-custom',
                    labelOffset: {
                        x: -8,
                        y: 6
                    },
                    textAnchor: 'end'})
            ],
        };

        this.currentSubChartType = "";

    }

    init() {
        this.updateScores();
    }

    updateScores() {
        this.updateOverallChart();
        var task = this.viewer.getActiveTask();
        if (task && task.type) {
            this.updateSubChart(task.type);
        }
        this.updateAVSStatistics();
    }

    updateChart(selector, type, data, options, colorAdapt) {
        if ($(selector).length > 0) {
            var chart = new Chartist[type](selector, data, options);
            chart.on("draw", (context) => {
                colorAdapt(context);
            });
        }
    }

    updateOverallChart() {
        var task = this.viewer.getActiveTask();
        if (task) {
            var teams = this.viewer.getTeams();
            var results = this.viewer.competitionState.results;
            var taskIdx = this.viewer.competitionState.activeTaskIdx;
            var sortedTeams = teams.sort((a, b) =>
                results[a._id].overallScores[taskIdx] - results[b._id].overallScores[taskIdx]
            );
            var labels = sortedTeams.map((t) => t.name);
            var series = [sortedTeams.map((t) => Math.round(results[t._id].overallScores[taskIdx]))];
            var data = {
                labels: labels,
                series: series
            }
            this.updateChart("#overallScoreChart", "Bar", data, this.barChartOptions, (context) => {
                if (context.type == "bar") {
                    context.element.attr({
                        style: "stroke-width: 25px; stroke: " + sortedTeams[context.index].color,
                    });
                }
            });
        }
    }

    nextTaskTypeChart() {
        // all types that have been used in the entire competition
        var availableTypes = Array.from(new Set(this.viewer.competitionState.tasks.map((t) => t.type))).sort();
        // filter to those types which had been used up to the active task (can be any task in inspect view)
        availableTypes = availableTypes.filter((t) => {
            for (var i = 0; i <= this.viewer.competitionState.activeTaskIdx; i++) {
                if (this.viewer.competitionState.tasks[i].type == t) {
                    return true;
                }
            }
            return false;
        });
        var currentIdx = availableTypes.indexOf(this.currentSubChartType);
        var nextIdx = (currentIdx + 1) % availableTypes.length;
        this.updateSubChart(availableTypes[nextIdx]);
    }

    updateSubChart(taskType) {
        if (taskType) {
            this.currentSubChartType = taskType;
            var teams = this.viewer.getTeams();
            var results = this.viewer.competitionState.results;
            // taskIdx relative to task type!
            var taskIdx = this.viewer.getTaskTypeSubIdx(taskType);
            var sortedTeams = teams.sort((a, b) =>
                results[a._id].subScores[taskType][taskIdx] - results[b._id].subScores[taskType][taskIdx]
            );
            var labels = sortedTeams.map((t) => t.name);
            var series = [sortedTeams.map((t) => Math.round(results[t._id].subScores[taskType][taskIdx]))];
            var data = {
                labels: labels,
                series: series
            }
            this.updateChart("#subScoreChart", "Bar", data, this.barChartOptions, (context) => {
                if (context.type == "bar") {
                    context.element.attr({
                        style: "stroke-width: 20px; stroke: " + sortedTeams[context.index].color,
                    });
                }
            });
            $("#subScoreTitle").html(taskType);
        }
    }

    updateAVSStatistics() {
        var task = this.viewer.getActiveTask();
        if (task && task.type.startsWith("AVS")) {
            var stats = this.viewer.competitionState.avsStatistics;
            $("#avsNumSubmissions").html(stats.submissions);
            $("#avsNumOpenJudgements").html(stats.unjudged);
            $("#avsNumVideos").html(stats.videos);
            $("#avsNumRanges").html(stats.ranges);
            $("#avsExtraInfo").show();
        } else {
            $("#avsExtraInfo").hide();
        }
    }

}
