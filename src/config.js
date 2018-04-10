let {TrantorNetwork} = require('trantor-js');
let {Utils, File} = require('./utils');
let {MainConstants, TestnetConstants} = require('./constants');

class RPCConfiguration {
    constructor(nodeConfigFile) {
        if (nodeConfigFile && File.exist(nodeConfigFile)) {
            let configuration = File.read(nodeConfigFile);
            let lines = configuration.split('\n');

            for (let x = 0; x < lines.length; x++) {
                let l = lines[x];
                let vals = l.split('=');
                this[vals[0]] = vals[1];
            }
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
     * @return {RPCConfiguration}
     */
    static create() {
        let rpcConf = new RPCConfiguration();
        rpcConf.setIfNotExist('rpcuser', Utils.randomString(9));
        rpcConf.setIfNotExist('rpcpassword', Utils.randomString(9));
        rpcConf.setIfNotExist('rpcworkqueue', 10000);
        rpcConf.setIfNotExist('port', Utils.randomNumber(20000, 65535));
        rpcConf.rpcport = 1188;
        rpcConf.txindex = 1;

        return rpcConf;
    }
}

class TrantorConfiguration {

    /**
     *
     * @param {TrantorNetwork} network
     * @param {RPCConfiguration} rpcConfig
     * @param {{}} constants
     */
    constructor(network, rpcConfig, constants) {
        this.network = network ? network : TrantorNetwork.TESTNET;
        this.rpcConfig = rpcConfig ? rpcConfig : RPCConfiguration.create();

        if (constants) {
            this.constants = constants;
        } else if (this.network === TrantorNetwork.TESTNET) {
            this.constants = TestnetConstants;
        } else {
            this.constants = MainConstants;
        }

    }
}

if (module) {
    module.exports = {
        RPCConfiguration, TrantorConfiguration
    }
}