var edit;
$(document).ready(function () {
    console.log("ready");
    edit = new Edit();
});

class Edit {
    constructor() {
        this.config = config;   // globally defined in edit.jade

        // associative arrays (key: _id) holding the entities
        // tasks and teams are wrt. to current competition
        this.users = {};
        this.competitions = {};
        this.tasks = {};
        this.teams = {};

        // ids of the currently selected entities
        this.activeUserId = null;
        this.activeCompetitionId = null;
        this.activeTaskId = null;
        this.activeTeamId = null;

        this.videoMap = null;

        this.socket = new ClientSockets({clientType: "admin"}, () => {
            // code is distributed over multiple files for better readability...
            userEditor.call(edit);
            competitionEditor.call(edit);
            taskEditor.call(edit);
            teamEditor.call(edit);

            edit.init(() => {
                console.log("initialized");
            });
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
            "preventDuplicates": true,
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

        $("#competitionDiv").show();
        $("#userDiv").show();

        var promises = [];
        promises.push(this.loadVideoMap());
        promises.push(this.refreshUsers());
        promises.push(this.refreshCompetitions());
        this.initVideoLoop();
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

    // re-arrange data as associative array mapping _id to object (for easier access)
    listToMap(list) {
        var map = {};
        for (var i = 0; i < list.length; i++) {
            map[list[i]._id] = list[i];
        }
        return map;
    }

}
