const IPFS = require('ipfs');
const Error = require('../error');
const {File, OS} = require('../utils');
const log4js = require('log4js');
const {ConsoleAppender, FileAppender} = log4js;

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

        //Setup logger
        log4js.configure({
            appenders: {
                console: { type: 'console', layout: {type: 'basic'} },
                everything: { type: 'file', filename: config.logFile, maxLogSize: 10485760, backups: 3, compress: true }
            },
            categories: { default: { appenders: [ 'console', 'everything' ], level: 'all' } }
        });

        this.logger = log4js.getLogger('ipfsclient');
        this.logger.level = 'all';
    }

    connect(swarm, callback) {
        let that = this;
        if (swarm) {
            this.swarm.connect(swarm, function (err) {
                if (callback) {
                    if (err) {
                        that.logger.error(err);
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
            that.logger.error(Error.INVALID_SWARM);
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
                that.logger.error(err);
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

                that.configuration.shareUrls.forEach(function (url) {
                    let options = {
                        method: 'GET',
                        headers: headers,
                        form: {'ipfs': ipfsData.hash, }
                    };

                    if (url.includes('gateway')) {
                        url = url + ipfsData.hash;
                        options.form = null;
                    } else {
                        options.method = 'POST';
                    }

                    options.url = url;
                    that.logger.info('sharing', options.url);
                    request(options, function (error, response, body) {
                        if (error) {
                            that.logger.error(error);
                        } else {
                            that.logger.info('IPFS Shared on', url);
                        }
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
                    that.logger.error(err);
                } else {
                    that.logger.info('File downloaded!', cid);

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
                    that.logger.debug('Writing', cid, file);
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

    close(callback) {
        let that = this;
        this.stop(function () {
            that.logger.info('IPFS node stopped!');
            if (callback) {
                callback();
            }
        });
    }
}

if (module) {
    module.exports = IpfsClient
}