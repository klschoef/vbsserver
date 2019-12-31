function teamEditor() {

    this.activeTeam = () => {
        if (this.activeTeamId && this.teams[this.activeTeamId] && this.teams[this.activeTeamId].competitionId === this.activeCompetitionId) {
            return this.teams[this.activeTeamId];
        } else {
            return null;
        }
    };


    // loads a list of all teams for the currently selected competition from the server
    // and fills the according selector
    // if previously a team had been selected, it is re-selected
    // (unless it has been deleted in the meantime)
    this.refreshTeams = () => {
        return new Promise((resolve, reject) => {
            if (!this.activeCompetition()) {    // if no competition is selected, don't load any teams..
                this.resetTeams();
                resolve();
            } else {
                this.socket.emit("loadTeams", {competitionId: this.activeCompetitionId}, (response) => {
                    if (response.success) {
                        console.log("refreshed teams");
                        this.teams = this.listToMap(response.data);

                        // fill selector with options
                        $("#teamSelect").empty();
                        $("#teamSelect").append("<option value='none' disabled='disabled'>Select Team</option>");
                        var teamList = Object.values(this.teams).sort((a, b) => a.teamNumber - b.teamNumber); // sort by team number
                        for (var i = 0; i < teamList.length; i++) {
                            var team = teamList[i];
                            let option = document.createElement("option");
                            $(option).html(team.teamNumber + ": " + team.name);
                            option.value = team._id;
                            $("#teamSelect").append(option);
                        }

                        // refresh can also be triggered after some changes,
                        // so we re-select the previous value (unless that one has been deleted)
                        if (this.activeTeam()) {
                            $("#teamSelect").val(this.activeTeamId);
                            this.teamSelected();
                        } else if (teamList.length > 0) {
                            $("#teamSelect").val(teamList[0]._id);
                            this.teamSelected();
                        } else {
                            $("#teamSelect").val('none');
                            this.resetCurrentTeam();
                        }
                        resolve();
                    } else {
                        this.resetTeams();
                        console.log("loading teams failed");
                        toastr.error("loading teams failed");
                        reject();
                    }
                });
            }
        });
    }


    this.resetTeams = () => {
        this.activeTeamId = null;
        this.teams = {};
        $("#teamSelect").empty();
        $("#teamBody").hide();
        this.hideTeamLogoUpload();
        $("#deleteTeamButton").hide();
    }

    this.resetCurrentTeam = () => {
        this.activeTeamId = null;
        $("#teamBody").hide();
        $("#deleteTeamButton").hide();
    }


    this.teamSelected = () => {
        this.activeTeamId = $("#teamSelect :selected").val();
        var team = this.activeTeam();
        console.log("team selected: " + JSON.stringify(team));
        $("#teamName").val(team.name);
        $("#teamNumber").val(team.teamNumber);
        $("#teamColor").val(team.color);
        $("#teamLogo").attr("src", team.logoSrc);
        $("#teamScore").val(team.totalScore);
        $("#teamBody").show();
        $("#deleteTeamButton").show();
        this.hideTeamLogoUpload();
    }


    this.addTeamButtonClicked = () => {
        var newTeam = {
            competitionId: this.activeCompetitionId,
            name: "Team " + (Object.keys(this.teams).length + 1),
            teamNumber: this.nextTeamNumber(),
            color: this.getRandomColor(),
            logoSrc: "images/logos/default.png"
        };
        this.socket.emit("createTeam", newTeam, (response) => {
            if (response.success) {
                toastr.success("New team created");
                var team = response.data;
                console.log(team);
                this.activeTeamId = team._id;   // select the new id (that we got from the server)
                this.refreshTeams();
            } else {
                toastr.error("Server error: creating team failed: " + response.data);
            }
        });
    }

    this.presetTeamButtonClicked = () => {

        var preset = $("#teamPresetSelect").val();
        var teams = [];
        var logos = [];

        var offset = 0.34;

        switch (preset) {
            case "VBS 2020":
                teams = ["EXQUISITOR", "IVIST", "KAIST", "SOMHUNTER", "VERGE", "VIREO", "VIRET", "VITRIVR", "VNUHCM", "ITEC"];
                logos = ["images/logos/2020/exquisitor.png",
                    "images/logos/2020/ivist.png",
                    "images/logos/default.png",
                    "images/logos/2020/somhunter.png",
                    "images/logos/2020/verge.png",
                    "images/logos/2020/vireo.jpg",
                    "images/logos/2020/viret.png",
                    "images/logos/2020/vitrivr.png",
                    "images/logos/2020/vnuhcm.png",
                    "images/logos/2020/itec.png"];
                offset = 0.13333;
                break;
            case "VBS 2018":
                teams = ["VIREO", "VITRIVR", "ITEC1", "ITEC2", "VNU", "SIRET", "NECTEC", "VERGE", "HTW"];
                logos = ["images/logos/2018/vireo.png",
                    "images/logos/2018/vitrivr.png",
                    "images/logos/2018/itec1.png",
                    "images/logos/2018/itec2.png",
                    "images/logos/2018/vnu.png",
                    "images/logos/2018/siret.png",
                    "images/logos/2018/nectec.png",
                    "images/logos/2018/verge.png",
                    "images/logos/2018/htw.png"];
                break;
            case "VBS 2019":
                teams = ["VITRIVR", "VIREO", "VERGE", "VIRET", "VISIONE", "ITEC"];
                logos = ["images/logos/2018/vitrivr.png",
                    "images/logos/2019/vireo.png",
                    "images/logos/2019/verge.png",
                    "images/logos/2019/viret.png",
                    "images/logos/2019/visione.png",
                    "images/logos/2019/itec.png"];
                offset = 0.13333;
                break;
            case "LSC 2018":
                teams = ["AAU", "SIRET", "DCU", "UUDCU", "VNU", "UPCDCU"];
                logos = ["images/logos/2018/aau.png",
                    "images/logos/2018/siret.png",
                    "images/logos/2018/dcu.png",
                    "images/logos/2018/uudcu.png",
                    "images/logos/2018/vnu.png",
                    "images/logos/2018/upcdcu.png"];
                offset += 2/teams.length;
                break;
            case "LSC 2019":
                teams = ["HCMUS", "EXQUI", "ITEC", "THUIR", "VIRET", "VITRIVR", "LENS", "SEEKER", "NTU"];
                logos = ["images/logos/2019/hcmus.png",
                    "images/logos/2019/exquisitor.png",
                    "images/logos/2019/itec2.png",
                    "images/logos/2019/thuir.jpg",
                    "images/logos/2019/viret.png",
                    "images/logos/2019/vitrivr.png", 
                    "images/logos/default.png",
                    "images/logos/2019/dcu.jpg",
                    "images/logos/2019/ntu.png"];
                offset += 2/teams.length;
                break;
            default :
                toastr.warning("Team Preset '" + preset + "' is not defined");
        }

        var hueStep = 1 / teams.length;

        for (var i = 0; i < teams.length; i++) {
            var newTeam = {
                competitionId: this.activeCompetitionId,
                name: teams[i],
                teamNumber: i + 1,
                color: this.HSVtoRGB((hueStep * i + offset ) % 1, 1, 0.8),
                logoSrc: logos[i]
            };

            this.socket.emit("createTeam", newTeam, (response) => {
                if (response.success) {
                    toastr.success("New team created");
                    var team = response.data;
                    console.log(team);
                    this.activeTeamId = team._id;   // select the new id (that we got from the server)
                    this.refreshTeams();
                } else {
                    toastr.error("Server error: creating team failed: " + response.data);
                }
            });
        }
    }

    this.deleteTeamButtonClicked = () => {
        var team = this.activeTeam();
        if (!team) {
            toastr.error("No team selected");
        } else {
            $.confirm({
                title: 'Delete team',
                content: "Do you really want to delete this team?",
                theme: "dark",
                boxWidth: '300px',
                useBootstrap: false,
                buttons: {
                    delete: () => {
                        this.socket.emit("deleteTeam", team, (response) => {
                            if (response.success) {
                                toastr.success("Team " + team.name + " was deleted");
                                this.refreshTeams();
                            } else {
                                toastr.error("Server error: deleting team failed: " + response.data);
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

    this.updateTeam = (team) => {
        this.socket.emit("updateTeam", team, (response) => {
            if (response.success) {
                toastr.success("Team updated");
            } else {
                toastr.error("Updating team failed: " + response.data);
            }
            this.refreshTeams();
        });
    }

    this.showTeamLogoUpload = () => {
        $("#teamLogoUpload").fadeIn();
        $("#teamLogoFile").click(); // user does not have to click a second time...
    }

    this.hideTeamLogoUpload = () => {
        $("#teamLogoUpload").fadeOut();
    }

    this.teamLogoUpload = () => {
        var file = $("#teamLogoFile")[0].files[0];
        var reader = new FileReader();
        reader.onload = (fileData) => {
            var imgData = fileData.target.result;
            this.socket.emit("uploadTeamLogo", imgData, (response) => {
                if (response.success) {
                    var team = this.activeTeam();
                    team.logoSrc = response.data.logoSrc;
                    this.updateTeam(team);
                } else {
                    toastr.error("Server error: uploading logo failed!");
                    console.error(response.data);
                }
            });
            this.hideTeamLogoUpload();
        }
        reader.readAsDataURL(file);
    }

    // changed event is triggered when the text has changed and the input element looses focus
    this.teamNameChanged = () => {
        var team = this.activeTeam();
        team.name = $("#teamName").val();
        this.updateTeam(team);
    }

    this.teamNumberChanged = () => {
        var team = this.activeTeam();
        team.teamNumber = parseInt($("#teamNumber").val());
        this.updateTeam(team);
    }

    this.teamColorChanged = () => {
        var team = this.activeTeam();
        team.color = $("#teamColor").val();
        this.updateTeam(team);
    }


    this.getRandomColor = () => {
        var letters = '0123456789ABCDEF';
        var color = '#';
        for (var i = 0; i < 6; i++) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        return color;
    }

    this.nextTeamNumber = () => {
        return Object.values(this.teams).map((team) => parseInt(team.teamNumber)).reduce((max, num) => Math.max(max, num), 0) + 1;
    }

    /**
     * Converts an HSV color value to RGB. Conversion formula
     * adapted from http://en.wikipedia.org/wiki/HSV_color_space.
     * Assumes h, s, and v are contained in the set [0, 1] and
     * returns r, g, and b in the set [0, 255]. edit: returns a hex string
     *
     * @param   Number  h       The hue
     * @param   Number  s       The saturation
     * @param   Number  v       The value
     * @return  Array           The RGB representation  edit: returns a hex string
     */
    this.HSVtoRGB = (h, s, v) => {
        var r, g, b;

        var i = Math.floor(h * 6);
        var f = h * 6 - i;
        var p = v * (1 - s);
        var q = v * (1 - f * s);
        var t = v * (1 - (1 - f) * s);

        switch (i % 6) {
            case 0:
                r = v, g = t, b = p;
                break;
            case 1:
                r = q, g = v, b = p;
                break;
            case 2:
                r = p, g = v, b = t;
                break;
            case 3:
                r = p, g = q, b = v;
                break;
            case 4:
                r = t, g = p, b = v;
                break;
            case 5:
                r = v, g = p, b = q;
                break;
        }

        return "#" + this.pad(Math.round(r * 255).toString(16), 2)
                + this.pad(Math.round(g * 255).toString(16), 2)
                + this.pad(Math.round(b * 255).toString(16), 2);
    }

    this.pad = (value, length) => {
        value = new String(value);
        while (value.length < length) {
            value = "0" + value;
        }
        return value;
    }

}
