const IPFS = require('ipfs');
const {Error} = require('../error');
const {File} = require('../utils');



class IpfsClient extends IPFS {

    /**
     *
     * @param {IpfsConfiguration} config
     */
    constructor(config) {
        if (!config) {
            throw Error.IPFS_CONF_NOT_FOUND;
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
        if (swarm) {
            this.swarm.connect(swarm, function (err) {
                if (callback) {
                    if (err) {
                        callback(err);
                    } else {
                        callback(null);
                    }
                }
            })
        } else if (callback) {
            callback(Error.INVALID_SWARM);
        }
    }

    /**
     *
     * @param {string} file
     * @param callback
     */
    createFile(file, callback) {
        let that = this;

        let name = File.getName(file);

        let fileBuffer = File.read(file, null);

        this.files.add(fileBuffer, function (err, resultFiles) {
            if (err && callback) {
                callback(err.stack.toString(), null, null)
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

                if (callback) {
                    callback(null, file, ipfsData);
                }
            }
        })
    }

    /**
     *
     * @param {string} contentAddress
     * @param {string} cid
     * @param callback
     * @param {boolean} privateContent
     */
    downloadFile(contentAddress, cid, callback, privateContent = false) {
        let that = this;
        if (cid) {
            let desPath = this.config.dataDir + contentAddress;
            if (privateContent) {
                desPath += '-p'
            }

            desPath += '/';
            let hash = cid.split('/')[0];
            let name = cid.split('/')[1];

            this.files.get(hash, function (err, files) {
                if (err) {
                    console.error(err);
                } else {
                    console.log('File downloaded!', cid, files);

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
                        data.CID = cid;
                        data.path = desPath;
                        data.destFile = file;
                        callback(data, file, contentAddress);
                    }
                }
            })
        }
    }

    close() {
        let that = this;
        this.node.stop(function () {
            console.log('IPFS node stopped!');
        });
    }
}

if (module) {
    module.exports = {
        IpfsConfiguration, IpfsClient
    }
}