let Core = require('./src/core');

Core.IpfsClient = require('./src/ipfs/ipfsclient');
Core.IndexDB = require('./src/database/db');
Core.Monetary = require('./src/coin');
Core.Config = require('./src/config');
Core.Constants = require('./src/constants');
Core.Error = require('./src/error');
Core.RPCWallet = require('./src/rpcwallet');
Core.Runner = require('./src/runner');

if (module) {
    module.exports = Core;
}