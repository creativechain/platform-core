const IPFS = require('ipfs');
const Constants = require('constants');
const {Error} = require('error');
const {File} = require('utils');

class IpfsConfiguration {

    /**
     *
     * @param {string} ipfsDir
     * @param dataDir
     * @param {Array} ipfsShareUrls
     */
    constructor(ipfsDir, dataDir, ipfsShareUrls) {
        this.ipfsDir = ipfsDir ? ipfsDir : Constants.MainConstants.IPFS_DIR;
        this.dataDir = dataDir ? dataDir : Constants.MainConstants.DATA_DIR;
        this.shareUrls = Array.isArray(ipfsShareUrls) ? ipfsShareUrls : [];
    }

    static getDefault() {
        return new IpfsConfiguration();
    }
}

class IpfsClient extends IPFS {

    /**
     *
     * @param {IpfsConfiguration} config
     */
    constructor(config) {
        if (!config) {
            config = IpfsConfiguration.getDefault();
        }

        if (config.ipfsDir) {
            super({
                repo: config.ipfsDir,
            })
        } else {
            super();
        }

        this.config = config;
    }

    connect(swarm, callback) {
        let that = this;
        if (swarm) {
            this.swarm.connect(swarm, function (err) {
                if (err) {
                    that.emit('connectionError', err);
                } else {
                    that.emit('connectionSuccess')
                }
            })
        } else {
            this.emit('connectionError', Error.INVALID_SWARM);
        }
    }

    /**
     *
     * @param {string} file
     */
    createFile(file) {
        let that = this;

        let name = File.getName(file);

        let fileBuffer = File.read(file, null);

        this.files.add(fileBuffer, function (err, resultFiles) {
            if (err) {
                that.emit('addError', err);
            } else if (resultFiles.length > 0) {
                let ipfsData = resultFiles[0];
                ipfsData.infoHash = ipfsData.hash;
                ipfsData.CID = ipfsData.hash + '/' + name;

                setTimeout(function () {
                    let request = require('request');

                    let headers = {
                        'User-Agent': 'Super Agent/0.0.1',
                        'Content-Type': 'application/x-www-form-urlencoded'
                    };

                    let options = {
                        method: 'GET',
                        headers: headers,
                        form: {'ipfs': ipfsData.hash, }
                    };

                    that.config.shareUrls.forEach(function (url) {
                        url = url + ipfsData.hash;
                        options.url = url;
                        request(options, function (error, response, body) {
                            console.log('IPFS Shared on', url)
                        });
                    });

                }, 100);

                that.emit('addFile', file, ipfsData)
            } else {
                that.emit('addFileEmpty', file);
                console.error('IPFS not build files', resultFiles)
            }
        })
    }

    /**
     *
     * @param {string} contentAddress
     * @param {string} magnet
     * @param callback
     * @param {boolean} privateContent
     */
    downloadFile(contentAddress, magnet, callback, privateContent = false) {
        let that = this;
        if (magnet) {
            let desPath = this.config.dataDir + contentAddress;
            if (privateContent) {
                desPath += '-p'
            }

            desPath += '/';
            let hash = magnet.split('/')[0];
            let name = magnet.split('/')[1];

            this.files.get(hash, function (err, files) {
                if (err) {
                    console.error(err);
                } else {
                    console.log('File downloaded!', magnet, files);

                    let data = null;
                    for (let x = 0; x < files.length; x++) {
                        let f = files[x];
                        if (f.type === 'file' && f.content) {
                            data = f;
                            break;
                        }
                    }

                    if (!data) {
                        data = files[0];
                    }

                    console.log('Writing', data);
                    let file = desPath + name;
                    console.log(file);
                    File.write(file, data.content, 'binary');

                    if (callback) {
                        data.infoHash = hash;
                        data.CID = magnet;
                        data.path = desPath;
                        data.destFile = file;
                        callback(data, file, contentAddress);
                        that.emit('download', data, file, contentAddress);
                    }
                }
            })
        }
    }

    close() {
        let that = this;
        this.node.stop(function () {
            console.log('IPFS node stopped!');
            that.emit('stopped');
        });
    }
}

if (module) {
    module.exports = {
        IpfsConfiguration, IpfsClient
    }
}