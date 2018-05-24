let log4js = require('log4js');

log4js.configure({
    appenders: {
        console: { type: 'console' },
        everything: { type: 'file', filename: 'test.log', maxLogSize: 10485760, backups: 3, compress: true }
    },
    categories: { default: { appenders: [ 'console', 'everything' ], level: 'all' } }
});


let logger = log4js.getLogger('test');

logger.level = 'all';
logger.warn('polla', { polla: 'coño'});