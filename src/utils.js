const os = require('os');
const fs = require('fs');
const { exec, execSync, spawn } = require('child_process');
const lzma = require('lzma');
const sha256 = require('sha256');
const Error = require('./error');
let filesize = require('file-size');
let path = require('path');
let upath = require('upath');
let request = require('request');

class OS {

    static getPlatform() {
        return os.platform();
    }

    static getRelease() {
        return os.release();
    }

    static getArch() {
        return os.arch();
    }

    static isLinux() {
        return os.platform().toLowerCase().includes('linux');
    };

    static isWindows() {
        return os.platform().toLowerCase().includes('win32');
    };

    static isWindows8Or10() {
        let release = OS.getRelease();
        return OS.isWindows() && (release.startsWith('8') || release.startsWith('10'));
    }

    static isMac() {
        return os.platform().toLowerCase().includes('darwin');
    }

    static is64Bits() {
        return os.arch().toLowerCase().includes('64');
    }

    /**
     *
     * @return {string}
     */
    static getAsarFolder() {
        let path = __dirname + '/../../../';
        path = path.replace('\\l', '/l')
            .replace('/lib', '');

        return path;
    }

    /**
     *
     * @returns {string}
     */
    static getPathSeparator() {
        return '/';
    }

    /**
     *
     * @returns {string}
     */
    static getHome() {
        if (OS.isLinux() || OS.isMac()) {
            return process.env.HOME + OS.getPathSeparator() + '.creativechain-platform';
        }

        return process.env.APPDATA + OS.getPathSeparator() + 'creativechain-platform';
    }

    static getFilenameVersion() {
        if (OS.isLinux()) {
            return OS.is64Bits() ? 'linux64' : 'linux32'
        } else if (OS.isMac()) {
            return 'osx'
        } else if (OS.isWindows()) {
            return OS.is64Bits() ? 'win64.exe' : 'win32.exe'
        }

        throw Error.INVALID_PLATFORM;
    }

    static getOSTag() {
        if (OS.isLinux()) {
            return 'linux64';
        } else if (OS.isMac()) {
            return 'osx'
        } else if (OS.isWindows()) {
            return OS.is64Bits() ? 'win64' : 'win32';
        }

        throw Error.INVALID_PLATFORM;
    }

    static getExecutableExtension() {
        if (OS.isLinux() || OS.isMac()) {
            return '';
        }

        return '.exe';
    }

    /**
     *
     * @param {string} command
     * @param {Array} args
     * @param callback
     */
    static run(command, args, callback) {
        let finalCommand = command + ' ' + (args.join(' '));
        console.log('executing command', finalCommand);
        exec(finalCommand, function (error, stdout, stderr) {
            if (error) {
                console.error(`exec error: ${error}`);
                callback(false, error);
            } else {
                callback(true);
            }
        });

        if (OS.isWindows()) {
            callback(true);
        }
    };

    static kill(pid) {
        let cmd = 'kill';
        let cmdArgs = [pid, '-9'];
        if (OS.isWindows()) {
            cmd = 'taskkill';
            cmdArgs = ['/PID', pid, '/F'];
        }

        OS.run(cmd, cmdArgs);
    }
}

class File {


    /**
     *
     * @param path
     * @return {XMLList|XML|string}
     */
    static normalizePath(path) {
        return upath.normalize(path);
    }

    /**
     *
     * @param path
     * @returns {boolean}
     */
    static exist(path) {
        try {
            let stat = fs.statSync(path);
            return true;
        } catch (err) {
        }
        return false;

    }

    /**
     *
     * @param {string} file
     * @param content
     * @param {string} format
     */
    static write(file, content, format = 'utf8') {
        //console.log('Writing', path);
        File.mkpath(file, true);
        fs.writeFileSync(file, content, format);
    }

    /**
     *
     * @param {string} path
     * @param {string} format
     * @return {string|Buffer}
     */
    static read(path, format = 'utf8') {
        return fs.readFileSync(path, format);
    }

    /**
     *
     * @param source
     * @param dest
     */
    static cp(source, dest) {
        console.log('Copying', source, dest);
        fs.createReadStream(source).pipe(fs.createWriteStream(dest));
    }

    /**
     *
     * @param {string} path
     */
    static remove(path) {
        if (File.exist(path)) {
            fs.unlinkSync(path);
        }
    }

    /**
     *
     * @param {string} path
     * @returns {string}
     */
    static getExtension(path) {
        return path.split('.').pop();
    }

    /**
     *
     * @param {string} path
     * @returns {string}
     */
    static getName(path) {
        path = File.normalizePath(path);
        return path.split('/').pop();
    }

    static mkdir(path) {
        path = File.normalizePath(path);
        if (!File.exist(path)) {
            fs.mkdirSync(path);
        }
    }

    /**
     *
     * @param {string} path
     * @param {boolean} hasFile
     */
    static mkpath(path, hasFile = false) {
        //console.log('Making dirs', path);
        path = File.normalizePath(path);
        let dirs = path.split('/');
        let route = '';
        let length = hasFile ? dirs.length - 1 : dirs.length;
        for (let x = 0; x < length; x++) {
            route += dirs[x] + '/';
            if (!File.exist(route)) {
                File.mkdir(route);
            }
        }
    }

    static chmod(path, permissions) {
        fs.chmodSync(path, permissions);
    }

    /**
     *
     * @param {string} url
     * @param {string} targetPath
     * @param progressCallback
     * @param callback
     */
    static download(url, targetPath, progressCallback, callback) {
        let receivedBytes = 0;
        let totalBytes = 0;

        File.mkpath(targetPath, true);
        let req = request({
            method: 'GET',
            uri: url,
            timeout: 5000
        });


        let out = fs.createWriteStream(targetPath);
        req.pipe(out);

        req.on('response', function (data) {
            totalBytes = parseInt(data.headers['content-length']);
        });

        req.on('error', function (err) {
            console.log('Resquest error', err);
            if (callback) {
                callback(err);
            }
        });

        req.on('data', function (chunk) {
            if (progressCallback) {
                receivedBytes += chunk.length;

                let percentage = (receivedBytes * 100) / totalBytes;
                progressCallback(percentage)
            }
        });

        req.on('end', function () {
            console.log('File downloaded!');
            if (callback) {
                callback(null, targetPath);
            }
        })

    }

    /**
     *
     * @param {string} file
     * @returns {*}
     */
    static fileInfo(file) {
        if (File.exist(file)) {
            let stat = fs.statSync(file);
            stat.formatSize = filesize(stat.size);
            return stat;
        }

        return undefined;
    }

    static getParentPath(route) {
        return path.dirname(route);
    }

    /**
     *
     * @param size
     * @return {*}
     */
    static formatSize(size) {
        return filesize(size).human('jedec')
    }

    static formatFileSize(file) {
        let stat = File.fileInfo(file);
        if (stat) {
            return stat.formatSize.human('jedec');
        }

        return '0.00 B';
    }
}

class FileStorage {
    constructor(storage, path) {
        this.storage = storage ? storage : {};
        this.path = path;
    }


    /**
     *
     * @param {string} key
     * @return {boolean}
     */
    hasKey(key) {
        let val = this.storage[key];
        return val !== null && val !== undefined;
    }

    /**
     *
     * @param {string} key
     * @param {*} defaultValue
     * @return {*}
     */
    getKey(key, defaultValue = undefined) {
        if (this.hasKey(key)) {
            return this.storage[key];
        }

        return defaultValue;
    }

    /**
     *
     * @param {string} key
     * @param {*} value
     */
    setKey(key, value) {
        this.storage[key] = value;
        this.save();
    }

    save() {
        let content = JSON.stringify(this.storage, null, 4);
        File.write(this.path, content);
    }

    /**
     *
     * @param {string} path
     * @return {FileStorage}
     */
    static load(path) {

        if (File.exist(path)) {
            let content = File.read(path);
            content = JSON.parse(content);
            return new FileStorage(content, path);
        }

        return new FileStorage(null, path);
    }
}

class Utils {
    /**
     *
     * @param length
     * @returns {string}
     */
    static randomString(length) {
        let string = "";
        let chars =  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvqxyz";

        for (let x = 0; x < length; x++) {
            string += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        return string;
    }

    /**
     *
     * @param {number} min
     * @param {number} max
     * @return {number}
     */
    static randomNumber(min = 0, max = 100) {
        return parseInt(Math.floor(Math.random() * (max - min + 1) + min));
    }

    /**
     *
     * @param {Buffer} data
     * @param {number} mode
     * @param callback
     */
    static compress(data, mode, callback) {
        console.log('Compressing data: ', data.length);
        let compressor = new lzma.LZMA();
        compressor.compress(data, mode, function (result, error) {
            result = Buffer.from(result);
            console.log('Data compressed:', result.length);
            callback(result, error);
        })
    }

    /**
     *
     * @param {Buffer} data
     * @return {Buffer}
     */
    static decompress(data) {
        let compressor = new lzma.LZMA();
        let result = compressor.decompress(data);
        return Buffer.from(result);
    }

    /**
     *
     * @param {string|Buffer} data
     * @return {string}
     */
    static makeHash(data) {
        return sha256(data);
    }

    /**
     *
     * @param {*} obj
     * @return {Array}
     */
    static keys(obj) {
        let keys = [];
        if (obj) {
            for (let k in obj) {
                keys.push(k);
            }
        }

        return keys;
    }

    /**
     *
     * @param newObj
     * @param defaultObj
     * @return {{}}
     */
    static combine(newObj, defaultObj) {
        let finalObj = {};
        Object.assign(finalObj, defaultObj, newObj);
        return finalObj;
    }
}

if (module) {
    module.exports = {
        OS, File, FileStorage, Utils
    }
}