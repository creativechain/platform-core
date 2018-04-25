let { IpfsClient } = require('./ipfsclient');

let ipfsClient = null;

function bindMethod(data) {
    if (data.method === 'start') {
        ipfsClient = new IpfsClient(data.arguments[0]);
    } else {
        let method = ipfsClient[data.method];
        data.arguments.push(function () {
            let args = Object.values(arguments);
            let response = {
                event: 'ipfs.' + data.id,
                response: args,
            };
            process.send(response);
        });
        method.apply(ipfsClient, data.arguments)
    }
}

function closeDb() {
    ipfsClient.close();
    process.kill(process.pid, 'SIGKILL')
}

process.on('message', (data) => {
    bindMethod(data);
});

process.on('SIGTERM', closeDb);