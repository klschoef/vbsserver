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
//            this.socket.emit("loadUsers", {}, (response) => {
//                if (response.success) {
//                    console.log("refreshed users");
//                    this.users = this.listToMap(response.data);
//                    // TODO selector etc.
//                    resolve();
//                } else {
//                    reject();
//                }
//            });  // TODO
            resolve();
        });
    }

    this.resetCurrentUser = () => {
        this.activeUserId = null;
        $("#userBody").hide();
    }
}