var exporter;
$(document).ready(() => {
    console.log("ready");
    exporter = new Export();
});


// TODO GUI to trigger various exports
// until now, this is only a dirty hack...

class Export {
    constructor() {
        this.config = config;   // globally defined in judge.jade
        this.socket = new ClientSockets({clientType: "export"});

        this.competitiondId = "k1mCozaxuU5ygs43";  // VBS 2018
//        this.competitiondId = "udU2XpG9W2J9bCeU";  // VBS 2018 Textual Session

//        this.exportCSV();

//        this.exportQueryFrames();

//        this.socket.emit("exportAvsStatistics", {competitionId: this.competitiondId}, (response) => {
//            console.log(response.data);
//        });

    }

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

    exportCSV() {
        // TODO selection of competition        

        this.socket.emit("exportTasks", {competitionId: this.competitionId}, (response) => {
            console.log(response.data);

            var link = document.createElement("a");
            document.body.appendChild(link);
            link.innerHTML = "Export Tasks";
            link.download = "tasks.csv";
            link.href = response.data;

        });

        this.socket.emit("exportTaskResults", {competitionId: this.competitionId}, (response) => {
            console.log(response.data);

            var link = document.createElement("a");
            document.body.appendChild(link);
            link.innerHTML = "Export TaskResults";
            link.download = "taskResults.csv";
            link.href = response.data;

        });

        this.socket.emit("exportSubmissions", {competitionId: this.competitionId}, (response) => {
            console.log(response.data);

            var link = document.createElement("a");
            document.body.appendChild(link);
            link.innerHTML = "Export Submissions";
            link.download = "submissions.csv";
            link.href = response.data;

        });
    }

}