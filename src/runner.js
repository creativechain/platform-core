let {fork} = require('child_process');
let EventEmitter = require('events');
let {Utils, File} = require('./utils');
let fs = require('fs');

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

    /**
     *
     * @param {...args} args
     */
    start(...args) {
        let that = this;
        this.fork = fork(this.script);
        this.fork.on('message', (data) => {
            let responseArgs = data.response;
            responseArgs.unshift(data.event);

            that.emit.apply(that, responseArgs);
            that.removeAllListeners(data.event)
        });

        this.fork.on('close', (code, signal) => {
            that.emit('close', code, signal);
        });

        this.fork.on('error', function (err) {
            that.emit('error', err)
        });

        this.fork.on('exit', function (code, signal) {
            that.emit('exit', code, signal);
        });

        this.fork.on('disconnect', function () {
            that.emit('disconnect');
            that.fork.kill('SIGTERM');
        });

        this.send('start', ...args);
    }

    /**
     *
     * @param {string} method
     * @param {...params} params
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

    /**
     *
     * @return {boolean}
     */
    isAlive() {
        return !this.fork.killed && !this.fork.connected;
    }

    stop() {
        this.fork.disconnect();
    }
}

if (module) {
    module.exports = Runner;
}