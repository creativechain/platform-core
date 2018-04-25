let RpcClient = require('altcoin-rpc');
let {RPCConfiguration} = require('./config');

class RPCWallet extends RpcClient {

    constructor(connection) {
        super(connection);
    }

    /**
     *
     * @param {RPCConfiguration} config
     */
    static buildClient(config) {
        if (!config) {
            config = RPCConfiguration.create();
            config.saveOn(config.constants.BIN_DIR + 'creativecoin.conf');
        }

        let rpcConnection = {
            username: config.rpcuser,
            password: config.rpcpassword,
            host: '127.0.0.1',
            port: config.rpcport,
            network: config.constants.DEBUG ? 'testnet' : 'mainnet'
        };

        return new RPCWallet(rpcConnection);
    }
}

if (module) {
    module.exports = RPCWallet;
}