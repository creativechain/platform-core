let RpcClient = require('altcoin-rpc');
let {RPCConfiguration} = require('./config');

class RPCWallet extends RpcClient {

    constructor(connection) {
        super(connection);
    }

    /**
     *
     * @param {RPCConfiguration} config
     * @param constants
     */
    static buildClient(config, constants) {
        if (!config) {
            config = RPCConfiguration.create();
            config.saveOn(constants.BIN_DIR + 'creativecoin.conf');
        }

        let rpcConnection = {
            username: config.rpcuser,
            password: config.rpcpassword,
            host: '127.0.0.1',
            port: config.rpcport,
            network: constants.DEBUG ? 'testnet' : 'mainnet'
        };

        return new RPCWallet(rpcConnection);
    }
}

if (module) {
    module.exports = RPCWallet;
}