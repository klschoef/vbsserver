
class SVGExporter {

    constructor(edit) {
        this.competitionId = edit.activeCompetitionId;
        this.socket = edit.socket;
        this.linkContainer = $("#svgExportContainer");
    }

    exportAll() {
        this.linkContainer.empty();
        this.export("submissions");
    }

    export(type) {
        var event = "exportSvg" + this.capitalizeFirstLetter(type);
        this.socket.emit(event, {competitionId: this.competitionId}, (response) => 
        {
            let linkKis = document.createElement("a");
            let linkAvs = document.createElement("a");
            $(linkKis).addClass("downloadLink");
            $(linkAvs).addClass("downloadLink");

            linkKis.innerHTML = type + " KIS";
            linkKis.download = type + ".kis.svg";
            linkKis.href = response.data.svgKis;

            linkAvs.innerHTML = type + " AVS";
            linkAvs.download = type + ".avs.svg";
            linkAvs.href = response.data.svgAvs;

            this.linkContainer.append(linkKis);
            this.linkContainer.append(linkAvs);
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
