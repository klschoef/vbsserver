class ImageSlideshow {

    constructor(delay) {
        this.delay = delay;
        this.taskId;
        this.container = $("#querySlideshow");

        this.images = [];
        this.currentIdx = -1;
        this.interval = null;
    }

    reset() {
        clearInterval(this.interval);
        this.interval = null;
        this.images = [];
        this.currentIdx = -1;
        this.taskId = null;
        $(this.container).empty();
    }

    setTask(task) {
        return new Promise((resolve, reject) => {
            if (task && task._id != this.taskId && task.type.startsWith("LSC_Textual") && task.imageList.length > 0) {
                this.reset();
                var promises = [];
                for (var i = 0; i < task.imageList.length; i++) {
                    promises.push(new Promise((resolveImg, rejectImg) => {
                        var img = new Image();
                        $(img).addClass("slideshowImage");
                        img.src = ThumbManager.getImagePath(task.imageList[i]);
                        this.images.push(img);
                        $(this.container).append(img);
                        img.onload = resolveImg;
                    }));
                    Promise.all(promises).then(resolve);
                }
            } else {
                reject();
            }
        });
    }

    show() {
        if (!this.interval) {
            this.showImage(0);
            this.interval = setInterval(() => {
                this.showImage((this.currentIdx + 1) % this.images.length);
            }, this.delay);
        }
        $("#querySlideshow").fadeIn();
    }

    showImage(idx) {
        this.currentIdx = idx;
        $(".slideshowImage").hide();
        $(this.images[idx]).show();
    }

    hide() {
        $("#querySlideshow").fadeOut();
        clearInterval(this.interval);
    }

}