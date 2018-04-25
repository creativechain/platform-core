let {fork} = require('child_process');
let EventEmitter = require('events');
let {Utils} = require('./utils');

class Runner extends EventEmitter {

    /**
     *
     * @param {string} script
     * @param {string} prefix
     */
    constructor(script, prefix) {
        super();
        this.script = script;
        this.prefix = prefix;
    }

    start(...args) {
        let that = this;
        this.fork = fork(this.script);
        this.fork.on('message', (data) => {
            let responseArgs = data.response;
            responseArgs.unshift(data.event);

            that.emit.apply(that, responseArgs);
            setTimeout(function () {
                that.removeAllListeners(data.event)
            }, 500);
        });

        this.fork.on('close', (code, signal) => {
            that.emit('close', code, signal);
        });

        this.send('start', ...args);
    }

    /**
     *
     * @param {string} method
     * @param {Array} params
     */
    send(method, ...params) {
        let id = Utils.randomNumber(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);

        let callback = params[params.length -1];

        if (callback instanceof Function) {
            params.pop();
        } else {
            callback = null;
        }

        if (callback) {
            this.on(this.prefix + '.' + id, callback)
        }

        this.fork.send({id: id, method: method, arguments: params});
    }

    stop() {
        this.fork.kill('SIGTERM');
    }
}

if (module) {
    module.exports = Runner;
}