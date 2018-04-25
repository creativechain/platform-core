let { IndexDB } = require('./db');

let db = null;

function bindMethod(data) {
    if (data.method === 'start') {
        db = new IndexDB(data.arguments[0], data.arguments[1]);
    } else {
        let method = db[data.method];
        data.arguments.push(function () {
            let args = Object.values(arguments);
            let response = {
                event: 'db.' + data.id,
                response: args,
            };
            process.send(response);
        });
        method.apply(db, data.arguments)
    }
}

function closeDb() {
    db.close();
    process.kill(process.pid, 'SIGKILL')
}

process.on('message', (data) => {
    bindMethod(data);
});

process.on('SIGTERM', closeDb);