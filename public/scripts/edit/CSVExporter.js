// exports relevant data of a competition in a bunch of csv files
class CSVExporter {

    constructor(edit) {
        this.competitionId = edit.activeCompetitionId;
        this.socket = edit.socket;
        this.linkContainer = $("#csvExportContainer");
    }

    exportAll() {
        this.linkContainer.empty();
        this.export("tasks");
        this.export("taskResults");
        this.export("submissions");
        this.export("avsStatistics");
    }

    export(type) {
        var event = "export" + this.capitalizeFirstLetter(type);
        this.socket.emit(event, {competitionId: this.competitionId}, (response) => {
            console.log(response.data);
            var link = document.createElement("a");
            $(link).addClass("downloadLink");
            link.innerHTML = type;
            link.download = type + ".csv";
            link.href = response.data;
            this.linkContainer.append(link);
        });
    }

    capitalizeFirstLetter(string) {
        return string.charAt(0).toUpperCase() + string.slice(1);
    }

    /*
        exportQueryFrames() {
            this.socket.emit("getCompetitionState", {competitionId: this.competitionId}, (response) => {
                var tasks = response.data.tasks;
                for (var i = 0; i < tasks.length; i++) {
                    var task = tasks[i];
                    if (task.finished && task.type.startsWith("KIS")) {
                        console.log((i + 1) + ": " + JSON.stringify(task.videoRanges[0]));
                    }
                }
            });
        }
    */

}
