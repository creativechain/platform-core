let IpfsClient = require('./ipfsclient');
let fs = require('fs');

let ipfsClient = null;

function bindMethod(data) {
    if (data.method === 'start') {
        ipfsClient = new IpfsClient(data.arguments[0]);
        if (data.arguments.length > 1) {
            let logFile = data.arguments[1];
            let log = fs.createWriteStream(logFile);
            //process.stdout.write = process.stderr.write = log.write.bind(log);
        }

        let response = {
            event: 'ipfs.' + data.id,
            response: ['ready']
        };
        ipfsClient.on('ready', function () {
            process.send(response);
        })
    } else {
        let method = ipfsClient[data.method];
        let response = {
            event: 'ipfs.' + data.id,
        };

        data.arguments.push(function () {
            response.response = Object.values(arguments);
            process.send(response);
        });

        if (method) {
            method.apply(ipfsClient, data.arguments)
        } else {
            response.response = [Error.FUNCTION_NOT_FOUND, data.method];
            process.send(response);
        }
    }
}

function closeClient() {
    ipfsClient.close();
    process.kill(process.pid, 'SIGKILL')
}

process.on('message', (data) => {
    bindMethod(data);
});

process.on('SIGTERM', closeClient);