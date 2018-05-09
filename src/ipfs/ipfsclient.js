const IPFS = require('ipfs');
const Error = require('../error');
const {File, OS} = require('../utils');

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

        this.configuration = config;

        let lockFile = config.constants.IPFS_DIR + 'repo.lock';

        //Delete repo.lock file for previous instance
        if (File.exist(lockFile)) {
            let lockPid = File.read(lockFile);
            try {
                lockPid = JSON.parse(lockPid);
                OS.kill(lockPid.ownerPID);
            } catch (e) {
                console.error(e);
            }

            File.remove(lockFile);
        }
    }

    connect(swarm, callback) {
        if (swarm) {
            this.swarm.connect(swarm, function (err) {
                if (callback) {
                    if (err) {
                        console.error(err);
                        if (err.stack) {
                            callback(err.stack.toString());
                        } else {
                            callback(err.toString());
                        }
                    } else {
                        callback(null);
                    }
                }
            })
        } else if (callback) {
            console.error(Error.INVALID_SWARM);
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
                console.error(err);
                callback(err.stack.toString(), null, null)
            } else if (resultFiles.length > 0) {
                let ipfsData = resultFiles[0];
                ipfsData.infoHash = ipfsData.hash;
                ipfsData.CID = ipfsData.hash + '/' + name;

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

                that.configuration.shareUrls.forEach(function (url) {
                    url = url + ipfsData.hash;
                    options.url = url;
                    request(options, function (error, response, body) {
                        console.log('IPFS Shared on', url)
                    });
                });

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
    downloadFile(contentAddress, cid, privateContent, callback) {
        let that = this;
        if (cid) {
            let desPath = this.configuration.dataDir + contentAddress;
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
                    console.log('File downloaded!', cid);

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

                    let file = desPath + name;
                    console.log('Writing', cid, file);
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
        this.stop(function () {
            console.log('IPFS node stopped!');
        });
    }
}

if (module) {
    module.exports = IpfsClient
}