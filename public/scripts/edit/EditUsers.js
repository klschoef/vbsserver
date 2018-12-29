function userEditor() {

    this.activeUser = () => {
        return (this.activeUserId) ? this.users[this.activeUserId] : null;
    }

    // loads a list of all users from the server and fills the according selector
    // if previously a user had been selected, it is re-selected
    // (unless it has been deleted in the meantime)
    // returns a Promise
    this.refreshUsers = () => {
        return new Promise((resolve, reject) => {
           this.socket.emit("loadUsers", {}, (response) => {
               if (response.success) {
                   console.log("refreshed users");
                   this.users = this.listToMap(response.data);

                   // fill selector with options
                   $("#userSelect").empty();
                   $("#userSelect").append("<option value='none' disabled='disabled'>Select User</option>");
                   var userList = Object.values(this.users).sort((a, b) => a.username.localeCompare(b.username)); // sort by username
                   for (var i = 0; i < userList.length; i++) {
                       var user = userList[i];
                       let option = document.createElement("option");
                       $(option).html(user.username + " (" + user.role + ")");
                       option.value = user._id;
                       $("#userSelect").append(option);
                   }

                   // refresh can also be triggered after some changes,
                   // so we re-select the previous value (unless that one has been deleted)
                   if (this.activeUser()) {
                       $("#userSelect").val(this.activeUserId);
                       this.userSelected();
                   } else if (userList.length > 0) {
                       $("#userSelect").val(userList[0]._id);
                       this.userSelected();
                   } else {
                       $("#userSelect").val('none');
                       this.resetCurrentUser();
                   }

                   resolve();
               } else {
                   this.resetUsers();
                   console.log("loading users failed");
                   toastr.error("loading users failed");
                   reject();
               }
           });
        });
    }

    this.resetUsers = ()=> {
        this.activeUserId = null;
        this.users = {};
        $("#userSelect").empty();
        $("#userBody").hide();
        $("#deleteUserButton").hide();
    }

    this.resetCurrentUser = () => {
        this.activeUserId = null;
        $("#userBody").hide();
        $("#deleteUserButton").hide();
    }

    this.userSelected = () => {
        this.activeUserId = $("#userSelect :selected").val();
        var user = this.activeUser();
        console.log("user selected: " + JSON.stringify(user));
        $("#username").val(user.username);
        $("#password").val(user.password);
        $("#userRoleSelect").val(user.role);
        $("#userBody").show();
        $("#deleteUserButton").show();
    }

    this.addUserButtonClicked = () => {
        var newUser = {
            username: "User " + (Object.keys(this.users).length + 1),
            password: this.generateRandomPassword(),
            role: "Viewer"
        };
        this.socket.emit("createUser", newUser, (response) => {
            if (response.success) {
                toastr.success("New user created");
                var user = response.data;
                console.log(user);
                this.activeUserId = user._id;   // select the new id (that we got from the server)
                this.refreshUsers();
            } else {
                toastr.error("Server error: creating user failed: " + response.data);
            }
        });
    }

    this.deleteUserButtonClicked = () => {
        var user = this.activeUser();
        if (!user) {
            toastr.error("No user selected");
        } else {
            $.confirm({
                title: 'Delete user',
                content: "Do you really want to delete this user?",
                theme: "dark",
                boxWidth: '300px',
                useBootstrap: false,
                buttons: {
                    delete: () => {
                        this.socket.emit("deleteUser", user, (response) => {
                            if (response.success) {
                                toastr.success("User " + user.username + " was deleted");
                                this.refreshUsers();
                            } else {
                                toastr.error("Server error: deleting user failed: " + response.data);
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

    this.updateUser = (user) => {
        this.socket.emit("updateUser", user, (response) => {
            if (response.success) {
                toastr.success("User updated");
            } else {
                toastr.error("Updating user failed: " + JSON.stringify(response.data));
            }
            this.refreshUsers();
        });
    }

    // changed event is triggered when the text has changed and the input element looses focus
    this.usernameChanged = () => {
        var user = this.activeUser();
        user.username = $("#username").val();
        this.updateUser(user);
    }

    this.passwordChanged = () => {
        var user = this.activeUser();
        user.password = $("#password").val();
        this.updateUser(user);
    }

    this.userRoleChanged = () => {
        var user = this.activeUser();
        user.role = $("#userRoleSelect :selected").val();
        this.updateUser(user);
    }

    this.generateRandomPassword = () => {
        return Math.random().toString(36).slice(-8);
    }


}
