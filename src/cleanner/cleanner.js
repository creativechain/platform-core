let {File} = require('../utils');


class Cleanner {
    /**
     *
     * @param {{hash: string, magnet: string, path: string, file: string}} dbFiles
     */
    constructor(dbFiles, maxTime) {
        this.dbFiles = dbFiles;
        this.filesDeleted = 0;
        this.sizeDeleted = 0;
    }

    __deleteFile(file) {
        let fileInfo = File.fileInfo(file);
        if (fileInfo) {

        }
    }

    clean() {

    }
}