let Core = require('./src/core');

let IpfsClient = require('./src/ipfs/ipfsclient');
let IndexDB = require('./src/database/db');
let Monetary = require('./src/coin');
let {RPCConfiguration, IpfsConfiguration, CoreConfiguration} = require('./src/config');
let Constants = require('./src/constants');
let Error = require('./src/error');
let RPCWallet = require('./src/rpcwallet');
let Runner = require('./src/runner');
let {OS, File, FileStorage, Utils} = require('./src/utils');
let {TxInput, TxOutput, DecodedTransaction, TransactionBuilder} = require('./src/txwrapper');

if (module) {
    module.exports = {
        Core, IpfsClient, IndexDB, Monetary, RPCConfiguration, IpfsConfiguration, CoreConfiguration, Constants, Error,
        RPCWallet, Runner, OS, File, FileStorage, Utils, TxInput, TxOutput, DecodedTransaction, TransactionBuilder
    };
}