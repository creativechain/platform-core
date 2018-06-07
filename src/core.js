let {CoreConfiguration} = require('./config');
let EventEmitter = require('events');
let Runner = require('./runner');
let IpfsClient = require('./ipfs/ipfsclient');
let RPCWallet = require('./rpcwallet');
let Error = require('./error');
let IndexDB = require('./database/db');
let {OS, File, Utils} = require('./utils');
let {DecodedTransaction, Spendable, TransactionBuilder} = require('./txwrapper');
let {Constants, TrantorUtils, ContentData, Author, Like, Follow, Unfollow, MediaData, Comment, Payment,
    BlockContent, UnblockContent} = require('trantor-js');
let creativecoin = require('bitcoinjs-lib');
let log4js = require('log4js');


class Core extends EventEmitter {
    /**
     *
     * @param {CoreConfiguration} coreConfig
     * @param {number} txContentAmount
     * @param {number} txFeeKb
     */
    constructor(coreConfig, txContentAmount, txFeeKb) {
        super();
        this.configuration = coreConfig;
        this.txContentAmount = txContentAmount;
        this.txFeeKb = txFeeKb;
        this.constants = coreConfig.constants;
        this.dbrunner = null;
        //this.dbrunner = new Runner(__dirname + '/database/dbrunner.js', 'db', coreConfig.constants.LOG_DIR + 'db.log');
        //this.ipfsrunner = new Runner(__dirname + '/ipfs/ipfsrunner.js', 'ipfs', coreConfig.constants.LOG_DIR + 'ipfs.log');
        this.ipfsrunner = null; //new IpfsClient(coreConfig.ipfsConfig);
        this.rpcWallet = RPCWallet.buildClient(coreConfig.rpcConfig);
        this.isInitializing = false;
        this.isExploring = false;

        if (!this.txContentAmount) {
            throw Error.UNDEFINED_TX_CONTENT_AMOUNT;
        }

        if (!this.txFeeKb) {
            throw Error.UNDEFINED_TX_FEE_RATE;
        }

        //Set network for trantor-js
        ContentData.NETWORK = coreConfig.network;

        //Setup logger
        log4js.configure({
            appenders: {
                console: { type: 'console', layout: {type: 'basic'} },
                everything: { type: 'file', filename: this.configuration.logfile, maxLogSize: 10485760, backups: 3, compress: true }
            },
            categories: { default: { appenders: [ 'console', 'everything' ], level: 'all' } }
        });

        this.logger = log4js.getLogger('core');
        this.logger.level = 'all';
    }

    __checkBinariesExists(callback) {
        let that = this;
        let binPlatform = OS.getFilenameVersion();
        let binaryName = this.constants.BINARY_NAME;

        let onFinish = function () {
            that.logger.debug('checkBinaryExists - onFinish');
            File.chmod(that.constants.BIN_DIR + binaryName, "0744"); //Set permissions rwx r-- ---
            that.emit('core.daemon.downloading', 100);
            callback(true);
        };

        let checksumFile = this.constants.BIN_DIR + 'sha256sums.txt';
        let binaryFile = this.constants.BIN_DIR + binaryName;
        let checksum;

        that.logger.debug('Checking binaries...');
        File.download(this.constants.CHECKSUMS_URL, checksumFile, null, function (error, file) {
            let content = null;
            if (error) {
                error = error.toString();
                checksum = true;

                if (!error.includes('ETIMEDOUT')) {
                    that.error(error);
                }
            } else {
                content = File.read(checksumFile);
                let lines = content.split('\n');
                for (let x = 0; x < lines.length; x++) {
                    let l = lines[x];
                    if (l.includes(binaryName)) {
                        checksum = l.split('  ')[0];
                        break;
                    }
                }
            }

            let downloadDaemon = function () {
                File.download(that.constants.DAEMON_URL + binPlatform, binaryFile, function (progress) {
                    that.logger.info('Downloading daemon', progress + '%');
                    that.emit('core.daemon.downloading', progress);
                }, function () {
                    setTimeout(function () {
                        onFinish();
                    }, 1000);
                })
            };

            if (checksum) {
                that.logger.info('Checksum found!');

                if (File.exist(binaryFile)) {
                    let binary = File.read(binaryFile, 'hex');
                    binary = Buffer.from(binary, 'hex');
                    let checksumBin = Utils.makeHash(binary);
                    that.logger.debug('Comparing checksums', checksumBin, checksum);
                    if (checksum && checksum === checksumBin) {
                        that.logger.debug('Checksums match');
                        onFinish();
                    } else {
                        that.logger.error('Checksums not match');

                        downloadDaemon()
                    }
                } else {
                    downloadDaemon();
                }
            } else {
                that.logger.error('Checksum not found!!', content);
                if (!File.exist(binaryFile)) {
                    downloadDaemon();
                } else {
                    onFinish();
                }
            }

        });
    }

    __initClients(callback) {
        let that = this;
        let inits = 3;

        let callCallback = function () {
            inits--;
            that.logger.info('Inits to perform:', inits);
            if (inits === 0) {
                if (callback) {
                    callback();
                }
            }
        };

        //Start Creativecoin Core
        this.startDaemon(callCallback);

        //Initialize Database
        this.startDb(callCallback);

        //Start IPFS
        this.startIpfs(callCallback);

    }

    startDaemon(callback) {
        let that = this;
        let folder = this.constants.BIN_DIR.replace(/(\r\n|\n|\r)/gm,"");
        let daemon = folder + this.constants.BINARY_NAME.replace(/(\r\n|\n|\r)/gm,"");

        OS.run(daemon, ['-usehd', '-datadir=' + folder], function (executed, error) {
            if (executed) {
                that.logger.debug('Starting daemon', daemon);
            } else {
                that.logger.error('Starting daemon failed', daemon, error);
            }

            if (callback) {
                callback(error);
            }
        });
    }

    startDb(callback) {
        let that = this;
        File.mkpath(this.constants.DATABASE_FILE, true);

        let startDb = function () {
            //that.dbrunner.start(that.constants.DATABASE_FILE, that.constants.DATABASE_CREATION_FILE);
            that.dbrunner = new IndexDB(that.constants.DATABASE_FILE, that.constants.DATABASE_CREATION_FILE);
            that.dbrunner.migrate(that.constants.DBMIGRATIONS_DIR, function (err) {
                that.logger.debug('Database initialized', err);
                if (callback) {
                    callback();
                }
            });
        };

        if (!File.exist(this.constants.DATABASE_FILE)) {
            that.on('core.bootstrap', function (ready) {
                startDb();
            });
            this.emit('core.bootstrap.download');
        } else {
            startDb();
        }
    }

    restartIpfs() {
        try {
            this.stopIpfs();
        } catch (err) {

        }

        try {
            this.startIpfs();
        } catch (err) {
            this.logger.error(err)
        }
    }

    startIpfs(callback) {
        let that = this;

        //Delete repo.lock file for previous instance
        let lockFile = this.constants.IPFS_DIR + 'repo.lock';

        if (File.exist(lockFile)) {
            let lockPid = File.read(lockFile);
            try {
                lockPid = JSON.parse(lockPid);
                OS.kill(lockPid.ownerPID);
            } catch (e) {
                this.logger.error(e);
            }

            File.remove(lockFile);
        }

        if (this.ipfsrunner) {
            this.ipfsrunner = null;
        }

        this.ipfsrunner = new IpfsClient(this.configuration.ipfsConfig);

        this.ipfsrunner.on('ready', function () {
            that.logger.debug('IPFS ready!');
            let swarm = '/ip4/213.136.90.245/tcp/4003/ws/ipfs/QmaLx52PxcECmncZnU9nZ4ew9uCyL6ffgNptJ4AQHwkSjU';
            that.ipfsrunner.connect(swarm, function (err) {
                if (err) {
                    that.ipfsrunner.logger.error(err);
                }
            });

            if (callback) {
                callback();
            }
        });

        this.ipfsrunner.on('error', function (error) {
            that.ipfsrunner.logger.error('IPFS Error:', error)
        });

    }

    /**
     *
     * @param callback
     */
    start(callback) {
        let that = this;
        this.emit('core.start');
        if (!this.isInitializing) {
            this.isInitializing = true;
            this.emit('core.loading');
            this.__checkBinariesExists(function (exists) {
                that.logger.debug('Binaries exists', exists);
                if (exists) {
                    that.__initClients(function () {
                        that.isInitializing = false;
                        that.logger.debug('emiting onstart');
                        that.emit('core.started');
                        if (callback) {
                            callback();
                        }
                    });
                } else {
                    that.emit('core.error', Error.BINARY_NOT_FOUND);
                }
            })
        } else {
            that.logger.debug('Trantor is initializing!');
        }
    }

    stopDaemon() {
        this.rpcWallet.stop();
    }

    stopDatabase() {
        this.dbrunner.close();
    }

    stopIpfs() {
        let that = this;
        try {
            this.ipfsrunner.stop(function (error) {
                if (error) {
                    that.ipfsrunner.logger.error(error);
                } else {
                    that.ipfsrunner.logger.debug('IPFS stop correctly!');
                }
            });
        } catch (err) {
            this.logger.error(err);
        }

    }

    stop(callback) {
        this.emit('core.stop');
        this.stopDaemon();
        this.stopDatabase();
        this.stopIpfs();

        if (callback) {
            setTimeout(function () {
                callback();
            }, 7000);
        }
    }

    /**
     *
     * @param {string} walletsrc
     * @param callback
     */
    restoreWallet(walletsrc, callback) {
        let that = this;
        that.logger.debug('Resotring wallet from', walletsrc);
        if (File.exist(walletsrc)) {
            this.stopDaemon();

            setTimeout(function () {
                File.cp(walletsrc, that.configuration.constants.WALLET_FILE);
                that.logger.debug('Wallet restored!');
                that.startDaemon(callback);
            }, 7000);
        } else if (callback) {
            callback(Error.FILE_NOT_FOUND);
        }

    }

    /**
     *
     * @param {string} walletdest
     * @param callback
     */
    backupWallet(walletdest, callback) {
        this.logger.debug('Creating backup wallet on', walletdest);
        this.rpcWallet.backupWallet(walletdest, callback);
    }

    explore(startBlock = 0) {
        let that = this;
        this.isExploring = true;
        let exploringBlock = false;
        let nextBlockHash = null;
        let blockInterval = null;
        let blockCount = null;
        let blockHeight = null;

        let broadcastProgress = function (currentHeight) {
            //that.log('broadcasting progress', currentHeight);
            that.emit('core.explore.progress', blockCount, currentHeight);
        };

        let processBlockHash = function () {
            let blockCountInterval = setInterval(function () {
                that.rpcWallet.getBlockCount(function (err, result) {
                    if (!err) {
                        blockCount = parseInt(result);
                    }
                });
            }, 30000);

            that.rpcWallet.getBlock(nextBlockHash, function (err, block) {
                //that.log(block);
                if (err) {
                    //Block not found

                    that.logger.error(err);

                    if (blockHeight >= blockCount) {
                        that.logger.debug('Exploration finish');

                        if (blockInterval) {
                            clearInterval(blockInterval);
                            blockInterval = null;
                        }

                        that.isExploring = false;
                        clearInterval(blockCountInterval);
                        that.dbrunner.updateLastExploredBlock(blockHeight, function (err, result) {
                            //that.logger.debug(err, result);
                        });
                        that.emit('core.explore.finish', blockCount, blockHeight);
                    }


                } else {
                    exploringBlock = true;
                    let blockTime = block.time * 1000;
                    let txIds = block.tx;
                    blockHeight = block.height;
                    let count = 0;
                    let readingIndex = false;
                    let nextBlock = block.nextblockhash;

                    let onReadTx = function () {

                        if (count === txIds.length && !readingIndex) {
                            broadcastProgress(blockHeight);

                            that.dbrunner.updateLastExploredBlock(blockHeight, function (err, result) {
                                //that.logger.debug(err, result);
                            });

                            nextBlockHash = nextBlock;
                            exploringBlock = false;
                            processBlockHash();

                        }
                    };

                    //that.logger.debug('Processing', txIds.length, 'transactions');

                    txIds.forEach(function (txHash) {

                        that.rpcWallet.getRawTransaction(txHash, function (err, rawTx) {
                            if (err) {
                                that.error('Error getting tx', txHash, err);
                                count++;
                                onReadTx();
                            } else {
                                let tx = DecodedTransaction.fromHex(rawTx, that.constants.NETWORK);

                                //that.logger.debug('Processing transaction with', tx.outputs.length, 'outputs');
                                if (tx.containsData()) {

                                    let broadcastData = function (data) {
                                        //that.log('broadcasting data', data);
                                        that.emit('core.data', tx, data, blockTime);
                                    };

                                    try {
                                        let data = tx.getData();
                                        if (data && data.type === Constants.TYPE.INDEX) {
                                            //If the data is an index, the data of the transactions of the index must be recovered.
                                            readingIndex = true;
                                            let index = data;
                                            let hexData = '';
                                            let indexTtxIds = index.txIds;
                                            let indexCount = 0;

                                            let onRaw = function () {
                                                if (indexCount === indexTtxIds.length) {
                                                    let newData = ContentData.deserialize(Buffer.from(hexData, 'hex'));
                                                    broadcastData(newData);
                                                    if (readingIndex) {
                                                        readingIndex = false;
                                                        onReadTx();
                                                    }
                                                }
                                            };
                                            indexTtxIds.forEach(function (txIdHash) {
                                                that.rpcWallet.getRawTransaction(txIdHash, function (err, result) {
                                                    //that.log('Raw tx', result);
                                                    let decodedTx = DecodedTransaction.fromHex(result);
                                                    hexData += decodedTx.getRawData().toString('hex');
                                                    indexCount++;
                                                    onRaw();
                                                })
                                            })
                                        } else if (data) {
                                            broadcastData(data);
                                        }
                                    } catch (e) {
                                        that.logger.error(e);
                                    }

                                }

                                count++;
                                onReadTx();
                            }
                        });

                    })
                }

            })
        };


        let startExploration = function (blockHeight) {
            startBlock = blockHeight < that.constants.START_BLOCK ? that.constants.START_BLOCK : blockHeight;
            that.logger.info('Start exploration at block', startBlock);

            that.rpcWallet.getBlockCount(function (err, result) {
                if (!err) {
                    that.logger.info('Total blocks', result);
                    that.emit('core.explore.start', startBlock);
                    blockCount = parseInt(result);

                    that.rpcWallet.getBlockHash(startBlock, function (err, blockHash) {
                        if (!err) {
                            that.logger.debug('BlockHash', blockHash);

                            nextBlockHash = blockHash;

                            processBlockHash();

                        } else {
                            if (startBlock >= blockCount) {
                                //Exploration finish
                                that.isExploring = false;
                            }

                            that.emit('core.explore.finish', blockCount, startBlock);
                        }
                    })
                } else {
                    that.logger.error(err);
                    that.isExploring = false;
                }
            });
        };

        if (!startBlock) {
            this.dbrunner.getLastExploredBlock(function (err, result) {
                if (err) {
                    that.logger.error(err);
                } else if (result.length > 0) {
                    result = result[0];
                    startExploration(result.lastExploredBlock+1);
                }
            })
        } else {
            startExploration(startBlock);
        }
    }

    restart(callback) {
        let that = this;
        this.stop(false);

        setTimeout(function () {
            that.start(callback)
        }, 7 * 1000);
    }

    /**
     *
     * @param {string} password
     * @param callback
     */
    encryptWallet(password, callback) {
        this.rpcWallet.encryptWallet(password, callback);
    }

    /**
     *
     * @param {number} minConfirmations
     * @param callback
     */
    getSpendables(minConfirmations = 0, callback) {
        let that = this;
        this.rpcWallet.listUnspent(minConfirmations, function (err, result) {
            //that.log('unspents', result);
            let spendables = Spendable.parseJson(result);
            callback(err, spendables);
        })
    }

    /**
     *
     * @param {ContentData} data
     * @param callback
     */
    buildDataOutput(data, callback) {
        let that = this;
        data.setCompression();
        let dataBuff = data.serialize();

        let buildOutData = function (dataHex, error) {
            let mByte = that.constants.DEBUG ? Constants.MAGIC_BYTE_TESTNET : Constants.MAGIC_BYTE;
            let outData = TrantorUtils.serializeNumber(mByte) + TrantorUtils.serializeNumber(data.mustBeCompressed) + dataHex.toString('hex');

            outData = Buffer.from(outData, 'hex');
            if (!error) {
                that.log('Final data:', outData.length, outData.toString('hex'));
                let ret = creativecoin.script.compile([
                    creativecoin.opcodes.OP_RETURN,
                    outData
                ]);
                callback(ret);
            } else {
                that.emit('core.build.error', error);
            }
        };

        if (data.mustBeCompressed) {
            Utils.compress(dataBuff, 9, function (dataCompressed, error) {
                buildOutData(dataCompressed, error);
            });
        } else {
            buildOutData(dataBuff, false);
        }

    }

    /**
     *
     * @param {string} address
     * @param callback
     */
    getPrivKey(address, callback) {
        let that = this;
        this.rpcWallet.dumpPrivKey(address, callback);
    }

    /**
     *
     * @param {string} txId
     * @param callback
     */
    getRawTransaction(txId, callback) {
        this.rpcWallet.getRawTransaction(txId, callback);
    }

    /**
     *
     * @param callback
     */
    getChangeAddress(callback) {
        this.rpcWallet.getRawChangeAddress(callback);
    }

    /**
     *
     * @param {string} rawTx
     * @param callback
     */
    sendRawTransaction(rawTx, callback) {
        let that = this;
        this.rpcWallet.sendRawTransaction(rawTx, function (err, result) {
            //that.log('send tx', result);
            that.emit('core.transaction.send', DecodedTransaction.fromHex(rawTx));
            if (callback) {
                callback(err, result);
            }
        })
    }

    /**
     *
     * @param {string} passphrase
     * @param {number} timeout
     * @param callback
     */
    decryptWallet(passphrase, timeout, callback) {
        this.rpcWallet.walletPassPhrase(passphrase, timeout, callback);
    }

    /**
     *
     * @param txBuilder
     * @param {Array} spendables
     * @param callback
     */
    signTransaction(txBuilder, spendables, callback) {
        let that = this;
        let privKeys = [];

        let signTx = function () {
            that.logger.debug(privKeys);

            for (let x = 0; x < privKeys.length; x++) {
                let pk = privKeys[x];
                privKeys[x] = creativecoin.ECPair.fromWIF(pk, that.constants.NETWORK);
                txBuilder.sign(x, privKeys[x]);
            }

            let txHex = txBuilder.build().toHex();
            that.logger.debug(txHex);
            if (callback) {
                callback(null, txHex);
            }
        };

        spendables.forEach(function (spend) {
            that.getPrivKey(spend.address, function (err, result) {
                if (err) {
                    if (callback) {
                        callback(err)
                    }
                } else {
                    privKeys.push(result);
                    if (privKeys.length === spendables.length) {
                        signTx();
                    }
                }

            });
        });
    }

    /**
     *
     * @param {ContentData} data
     * @param {string} destinyAddress
     * @param {number} amount
     * @param callback
     */
    createDataTransaction(data, destinyAddress, amount, callback) {
        let that = this;
        this.log(data);
        amount = amount ? amount : this.txContentAmount;
        let onBuild = function (txBuilder, creaBuilder) {
            if (callback) {
                callback(null, creaBuilder, txBuilder.inputs, txBuilder);
            }
        };

        this.getSpendables(0, function (err, spendables) {
            if (err) {
                that.logger.error(err);
            } else if (spendables.length > 0) {
                that.buildDataOutput(data, function (opReturnData) {
                    let dataSize = opReturnData.length;

                    let txBuilder = new TransactionBuilder(that.constants.NETWORK, that.txFeeKb, dataSize);

                    that.rpcWallet.getRawChangeAddress(function (err, result) {
                        if (err) {
                            that.error(err);
                        } else {
                            txBuilder.changeAddress = result;
                            txBuilder.addOutput(destinyAddress, amount);

                            txBuilder.completeTx(spendables);

                            if (txBuilder.complete) {
                                let creaBuilder = txBuilder.txb;
                                creaBuilder.addOutput(opReturnData, 0);

                                let fee = txBuilder.txFee;
                                that.log('Fee: ', Coin.parseCash(txBuilder.txFee, 'CREA').toString() + '/B');
                                creaBuilder.txFee = fee;
                                onBuild(txBuilder, creaBuilder);
                            } else {
                                that.error('Tx is incomplete', txBuilder, spendables);
                                if (callback) {
                                    callback(Error.INSUFFICIENT_AMOUNT);
                                }
                            }
                        }
                    });

                });
            } else {
                that.error('Not found spendables for this data', err, spendables);
                if (callback) {
                    callback(Error.NOT_SPENDABLES);
                }
            }

        })
    }

    /**
     *
     * @param {string} userAddress
     * @param {string} nick
     * @param {string} email
     * @param {string} web
     * @param {string} description
     * @param {string} avatar
     * @param {Array} tags
     */
    register(userAddress, nick, email, web, description, avatar, tags) {
        let that = this;

        that.log('Author Torrent created!', avatar);
        let avatarCID = avatar ? avatar.CID : '';
        let userReg = new Author(userAddress, nick, email, web, description, avatarCID, tags);
        let buffUser = userReg.serialize();
        that.createDataTransaction(userReg, userAddress, null, function (error, txBuilder, spendables) {

            if (error) {
                that.error(error);
            } else {
                that.signTransaction(txBuilder, spendables, function (err, rawTx) {
                    if (err) {
                        that.error(err);
                    } else {
                        let txBuffer = Buffer.from(rawTx, 'hex');
                        let tx = creativecoin.Transaction.fromBuffer(txBuffer);
                        that.emit('core.register.build', txBuilder, txBuffer, userReg, avatar);
                    }

                });
            }

        });
    }

    /**
     *
     * @param {string} userAddress
     * @param {string} publishAddress
     * @param {string} title
     * @param {string} description
     * @param {string} contentType
     * @param {number} license
     * @param {Array} tags
     * @param {*} publicTorrent
     * @param {*} privateTorrent
     * @param {number} price
     * @param {string} hash
     * @param {number} publicFileSize
     * @param {number} privateFileSize
     */
    publish(userAddress, publishAddress, title, description, contentType, license, tags, publicTorrent, privateTorrent, price, hash, publicFileSize, privateFileSize) {
        let that = this;

        let pubUri = publicTorrent ? publicTorrent.CID : '';
        let prvUri = privateTorrent ? privateTorrent.CID : '';
        let mediaPost = new MediaData(title, description, contentType, license, userAddress,
            publishAddress, tags, price, pubUri, prvUri, hash, publicFileSize, privateFileSize);

        let postBuffer = mediaPost.serialize();

        that.createDataTransaction(mediaPost, publishAddress, null, function (error, txBuilder, spendables) {
            if (error) {
                that.error(error);
            } else {
                that.signTransaction(txBuilder, spendables, function (err, rawTx) {
                    if (err) {
                        that.error(err);
                    } else {
                        let txBuffer = Buffer.from(rawTx, 'hex');
                        let tx = creativecoin.Transaction.fromBuffer(txBuffer);
                        that.emit('core.publication.build', txBuffer, mediaPost, txBuilder);
                    }

                });
            }

        });
    }

    /**
     *
     * @param {string} userAddress
     * @param {string} contentAddress
     * @param {string} comment
     */
    comment(userAddress, contentAddress, comment) {
        let that = this;
        let commentData = new Comment(userAddress, contentAddress, comment);
        let commentBuffer = commentData.serialize();
        this.createDataTransaction(commentData, userAddress, null, function (error, txBuilder, spendables) {
            if (error) {
                that.error(error);
            } else {
                that.signTransaction(txBuilder, spendables, function (err, rawTx) {
                    if (err) {
                        that.error(err);
                    } else {
                        let txBuffer = Buffer.from(rawTx, 'hex');
                        that.emit('core.comment.build', txBuffer, commentData);
                    }
                });
            }
        })
    }

    /**
     *
     * @param {string} userAddress
     * @param {string} contentAddress
     * @param {number} likeAmount
     */
    like(userAddress, contentAddress, likeAmount) {
        let that = this;
        let likeData = new Like(userAddress, contentAddress);
        let likeBuffer = likeData.serialize();
        this.createDataTransaction(likeData, contentAddress, likeAmount, function (error, txBuilder, spendables) {
            if (error) {
                that.error(error);
            } else {
                that.signTransaction(txBuilder, spendables, function (err, rawTx) {
                    if (err) {
                        that.error(err);
                    } else {
                        let txBuffer = Buffer.from(rawTx, 'hex');
                        that.emit('core.like.build', txBuffer, likeData);
                    }
                });
            }
        })
    }

    payment(userAddress, contentAddress) {
        let that = this;

        that.dbrunner.getMediaByAddress(contentAddress, userAddress, function (err, result) {
            if (err) {
                that.error(err);
            } else {
                result = result[0];
                let paymentData = new Payment(userAddress, contentAddress, result.price);
                that.createDataTransaction(paymentData, contentAddress, result.price, function (error, creaBuilder, spendables, txBuilder) {
                    if (error) {
                        that.error(error);
                    } else {
                        that.signTransaction(creaBuilder, spendables, function (err, rawTx) {
                            if (err) {
                                that.error(err);
                            } else {
                                let txBuffer = Buffer.from(rawTx, 'hex');
                                that.emit('core.payment.build', creaBuilder, txBuffer, paymentData, txBuilder);
                            }
                        });
                    }
                })

            }
        })
    }

    follow(userAddress, followedAddress) {
        let that = this;
        let followData = new Follow(userAddress, followedAddress);
        this.createDataTransaction(followData, userAddress, null, function (error, creaBuilder, spendables, txBuilder) {
            if (error) {
                that.error(error);
            } else {
                that.signTransaction(creaBuilder, spendables, function (err, rawTx) {
                    if (err) {
                        that.error(err);
                    } else {
                        let txBuffer = Buffer.from(rawTx, 'hex');
                        that.emit('core.follow.build', creaBuilder, txBuffer, followData, txBuilder);
                    }
                })
            }
        })
    }

    unfollow(userAddress, followedAddress) {
        let that = this;
        let followData = new Unfollow(userAddress, followedAddress);
        this.createDataTransaction(followData, userAddress, null, function (error, creaBuilder, spendables, txBuilder) {
            if (error) {
                that.error(error);
            } else {
                that.signTransaction(creaBuilder, spendables, function (err, rawTx) {
                    if (err) {
                        that.error(err);
                    } else {
                        let txBuffer = Buffer.from(rawTx, 'hex');
                        that.emit('core.unfollow.build', creaBuilder, txBuffer, followData, txBuilder);
                    }
                })
            }
        })
    }

    block(userAddress, followedAddress) {
        let that = this;
        let followData = new BlockContent(userAddress, followedAddress);
        this.createDataTransaction(followData, userAddress, null, function (error, creaBuilder, spendables, txBuilder) {
            if (error) {
                that.error(error);
            } else {
                that.signTransaction(creaBuilder, spendables, function (err, rawTx) {
                    if (err) {
                        that.error(err);
                    } else {
                        let txBuffer = Buffer.from(rawTx, 'hex');
                        that.emit('core.block.build', creaBuilder, txBuffer, followData, txBuilder);
                    }
                })
            }
        })
    }

    unblock(userAddress, followedAddress) {
        let that = this;
        let followData = new UnblockContent(userAddress, followedAddress);
        this.createDataTransaction(followData, userAddress, null, function (error, creaBuilder, spendables, txBuilder) {
            if (error) {
                that.error(error);
            } else {
                that.signTransaction(creaBuilder, spendables, function (err, rawTx) {
                    if (err) {
                        that.error(err);
                    } else {
                        let txBuffer = Buffer.from(rawTx, 'hex');
                        that.emit('core.unblock.build', creaBuilder, txBuffer, followData, txBuilder);
                    }
                })
            }
        })
    }

    insertMedia(media, tx, date, callback) {
        this.dbrunner.addMedia(media, tx, date, callback);
    }

    /**
     *
     * @param {Comment} comment
     * @param {DecodedTransaction} tx
     * @param {number} date
     * @param callback
     */
    insertComment(comment, tx, date, callback) {
        this.dbrunner.addComment(comment, tx, date, callback);
    }

    /**
     *
     * @param {string} address
     * @param {string} userAddress
     * @param callback
     */
    getUserData(address, userAddress, callback) {
        this.dbrunner.getAuthor(address, userAddress, callback);
    }

    /**
     *
     * @param {Array} tags
     * @param {string} userAddress
     * @param callback
     */
    searchByTags(tags, userAddress, callback) {
        this.dbrunner.getMediaByTags(tags, userAddress, callback);
    }

    log(...args) {
        if (this.configuration.debug) {
            args.unshift('core.log');
            this.emit.apply(this, args);
        }
    }

    error(...args) {
        if (this.configuration.debug) {
            args.unshift('core.error');
            this.emit.apply(this, ...args);
        }

    }
}

if (module) {
    module.exports = Core
}