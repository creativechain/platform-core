let { IpfsClient } = require('./ipfsclient');

let db = null;

function bindMethod(data) {
    if (data.method === 'start') {
        db = new IpfsClient(data.arguments[0]);
    } else {
        let method = db[data.method];
        data.arguments.push(function () {
            let args = Object.values(arguments);
            let response = {
                event: 'ipfs.' + data.id,
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