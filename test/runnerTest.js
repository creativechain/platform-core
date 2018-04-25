let Runner = require('../src/runner');

let dbRunner = new Runner('./src/database/dbrunner.js', 'db');

dbRunner.start('test.db', '/home/ander/WebstormProjects/creativechain-universe/extra/index.db.sql');
dbRunner.send('migrate', ['/home/ander/WebstormProjects/creativechain-universe/extra/dbmigrations'], function (err) {
    console.log('migration performed!', err)
});

setTimeout(function () {

    dbRunner.send('getLastExploredBlock', [], function (err, result) {
        console.log('Response', err, result);
    })
}, 3000);