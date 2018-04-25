let {TrantorNetwork} = require('trantor-js');
let {Utils, File} = require('./utils');
let {MainnetConstants, TestnetConstants} = require('./constants');
let Error = require('./error');

class Configuration {

    /**
     *
     * @param constants
     */
    constructor(constants = MainnetConstants) {
        this.constants = constants;
    }
}

class RPCConfiguration extends Configuration{

    /**
     *
     * @param constants
     * @param nodeConfigFile
     */
    constructor(constants, nodeConfigFile) {
        super(constants);
        if (nodeConfigFile && File.exist(nodeConfigFile)) {
            let configuration = File.read(nodeConfigFile);
            let lines = configuration.split('\n');

            for (let x = 0; x < lines.length; x++) {
                let l = lines[x];
                let vals = l.split('=');
                this[vals[0]] = vals[1];
            }
        } else {
            this.setIfNotExist('rpcuser', Utils.randomString(9));
            this.setIfNotExist('rpcpassword', Utils.randomString(9));
            this.setIfNotExist('rpcworkqueue', 10000);
            this.setIfNotExist('port', Utils.randomNumber(20000, 65535));
            this.rpcport = 1188;
            this.txindex = 1;

            let rpcConfFile = constants.BIN_DIR + 'creativecoin.conf';
            this.saveOn(rpcConfFile);
        }
    }

    /**
     *
     * @param {string} key
     * @returns {boolean}
     */
    hasKey(key) {
        return !!this[key];
    }

    /**
     *
     * @param {string} key
     * @param {*} value
     */
    setIfNotExist(key, value) {
        if (!this.hasKey(key)) {
            this[key] = value;
        }
    }

    /**
     *
     * @param {string} file
     * @param {string|number} permission
     */
    saveOn(file, permission = '0640') {
        File.mkpath(file, true);
        let content = '';
        let keys = Object.keys(this);

        for (let x = 0; x < keys.length; x++) {
            let k = keys[x];
            let val = this[k];
            if (k.length > 0) {
                content += k + '=' + val + '\n';
            }
        }

        File.write(file, content);
        File.chmod(file, permission); //Set permissions rw- r-- ---
    }

    /**
     *
     * @param constants
     * @return {RPCConfiguration}
     */
    static create(constants) {
        let rpcConf = new RPCConfiguration(constants);
        rpcConf.setIfNotExist('rpcuser', Utils.randomString(9));
        rpcConf.setIfNotExist('rpcpassword', Utils.randomString(9));
        rpcConf.setIfNotExist('rpcworkqueue', 10000);
        rpcConf.setIfNotExist('port', Utils.randomNumber(20000, 65535));
        rpcConf.rpcport = 1188;
        rpcConf.txindex = 1;

        let rpcConfFile = constants.BIN_DIR + 'creativecoin.conf';
        rpcConf.saveOn(rpcConfFile);

        return rpcConf;
    }

    /**
     *
     * @param constants
     * @return {RPCConfiguration}
     */
    static getDefault(constants) {
        if (constants) {
            let rpcConfFile = constants.BIN_DIR + 'creativecoin.conf';
            return new RPCConfiguration(constants, rpcConfFile);
        }

        return RPCConfiguration.create();
    }

}

class IpfsConfiguration extends Configuration{

    /**
     *
     * @param constants
     * @param {string} ipfsDir
     * @param dataDir
     * @param {Array} ipfsShareUrls
     */
    constructor(constants, ipfsDir, dataDir, ipfsShareUrls) {
        super(constants);
        this.ipfsDir = ipfsDir ? ipfsDir : this.constants.IPFS_DIR;
        this.dataDir = dataDir ? dataDir : this.constants.DATA_DIR;
        this.shareUrls = Array.isArray(ipfsShareUrls) ? ipfsShareUrls : [];
    }

    static getDefault(constants) {
        return new IpfsConfiguration(constants);
    }
}

class CoreConfiguration extends Configuration {

    /**
     *
     * @param constants
     * @param {RPCConfiguration} rpcConfig
     * @param {IpfsConfiguration} ipfsConfig
     */
    constructor(constants, rpcConfig, ipfsConfig) {
        super(constants);
        this.rpcConfig = rpcConfig ? rpcConfig : RPCConfiguration.getDefault(constants);
        this.ipfsConfig = ipfsConfig ? ipfsConfig : IpfsConfiguration.getDefault(constants);

        if (!constants) {
            throw  Error.CONSTANTS_NOT_FOUND;
        }

        if (this.constants === MainnetConstants) {
            this.network = TrantorNetwork.MAINNET;
        } else {
            this.network = TrantorNetwork.TESTNET;
        }
    }
}

if (module) {
    module.exports = {
        RPCConfiguration, IpfsConfiguration, CoreConfiguration
    }
}