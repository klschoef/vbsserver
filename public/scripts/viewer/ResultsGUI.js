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
                scaleMinSpace: 50
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


    }

    init() {
        this.updateScores();
    }

    updateScores() {
        this.updateOverallChart();
        this.updateSubChart();
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

    updateSubChart() {
        var task = this.viewer.getActiveTask();
        if (task) {
            var teams = this.viewer.getTeams();
            var results = this.viewer.competitionState.results;
            // taskIdx relative to task type!        
            var taskIdx = this.viewer.getActiveTaskSubIdx();
            var sortedTeams = teams.sort((a, b) =>
                results[a._id].subScores[task.type][taskIdx] - results[b._id].subScores[task.type][taskIdx]
            );
            var labels = sortedTeams.map((t) => t.name);
            var series = [sortedTeams.map((t) => Math.round(results[t._id].subScores[task.type][taskIdx]))];
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
            $("#subScoreTitle").html(task.type);
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