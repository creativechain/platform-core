let IndexDB = require('./db');
let fs = require('fs');

let db = null;

function bindMethod(data) {
    if (data.method === 'start') {
        db = new IndexDB(data.arguments[0], data.arguments[1]);
        if (data.arguments.length > 2) {
            let logFile = data.arguments[2];
            let log = fs.createWriteStream(logFile);
            process.stdout.write = process.stderr.write = log.write.bind(log);
        }
    } else {
        let method = db[data.method];
        let response = {
            event: 'db.' + data.id,
        };

        data.arguments.push(function () {
            response.response = Object.values(arguments);
            process.send(response);
        });

        if (method) {
            method.apply(db, data.arguments)
        } else {
            response.response = [Error.FUNCTION_NOT_FOUND, data.method];
            process.send(response);
        }
    }
}

function closeClient() {
    db.close();
    process.kill(process.pid, 'SIGKILL')
}

process.on('message', (data) => {
    bindMethod(data);
});

process.on('SIGTERM', closeClient);