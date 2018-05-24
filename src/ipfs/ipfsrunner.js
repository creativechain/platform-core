let IpfsClient = require('./ipfsclient');
let fs = require('fs');

let ipfsClient = null;

function bindMethod(data) {
    if (data.method === 'start') {
        ipfsClient = new IpfsClient(data.arguments[0]);
        ipfsClient.logger.info('IPFS Created!');
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
}

process.on('message', (data) => {
    bindMethod(data);
});

process.on('SIGTERM', closeClient);