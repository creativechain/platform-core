
let Error = {
    INVALID_PLATFORM: 'INVALID_PLATFORM',
    INVALID_SWARM: 'INVALID_SWARM',
    NO_DB_CREATION_FILE: 'NO_DB_CREATION_FILE',
    IPFS_CONF_NOT_FOUND: 'IPFS_CONF_NOT_FOUND',
    CONSTANTS_NOT_FOUND: 'CONSTANTS_NOT_FOUND',
    BINARY_NOT_FOUND: 'BINARY_NOT_FOUND',
    INSUFFICIENT_AMOUNT: 'INSUFFICIENT_AMOUNT',
    NOT_SPENDABLES: 'NOT_SPENDABLES',
    UNDEFINED_TX_CONTENT_AMOUNT: 'UNDEFINED_TX_CONTENT_AMOUNT',
    UNDEFINED_TX_FEE_RATE: 'UNDEFINED_TX_FEE_RATE',
    FUNCTION_NOT_FOUND: 'FUNCTION_NOT_FOUND',
    UNDEFINED_LOG_FILE: 'UNDEFINED_LOG_FILE'
};

if (module) {
    module.exports = Error;
}