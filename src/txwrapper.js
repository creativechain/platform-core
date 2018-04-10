const creativecoin = require('bitcoinjs-lib');
const coinselect = require('coinselect');
const {TrantorUtils, TrantorNetwork, Content} = require('trantor-js');
const {ContentData} = Content;
const {Utils} = require('utils');

class TxInput {

    /**
     *
     * @param {TrantorNetwork} network
     * @param hash
     * @param index
     * @param script
     * @param sequence
     * @param witness
     */
    constructor(network, hash, index, script, sequence, witness) {
        this.txHash = hash;
        this.txIndex = index;
        this.script = script;
        this.sequence = sequence;
        this.witness = witness;
        this.network = network;
    }
}

class TxOutput {
    /**
     *
     * @param {TrantorNetwork} network
     * @param script
     * @param value
     * @param vout
     */
    constructor(network, script, value, vout) {
        this.script = script;
        this.value = value;
        this.vout = vout;
        this.network = network;
    }

    /**
     *
     * @return {boolean}
     */
    hasData() {
        if (this.hasRawData()) {
            let scriptBuffer = this.getBufferedScript();
            let asm = creativecoin.script.toASM(scriptBuffer);
            let dataHex = asm.replace('OP_RETURN ', '');
            let mByte = this.network.trantorMagicByte;
            return dataHex.startsWith(TrantorUtils.serializeNumber(mByte, 1));
        }

        return false;

    }

    /**
     *
     * @return {boolean}
     */
    hasRawData() {
        let scriptBuffer = this.getBufferedScript();
        let asm = creativecoin.script.toASM(scriptBuffer);
        return asm.startsWith('OP_RETURN');
    }

    /**
     *
     * @return {Buffer}
     */
    getRawData() {
        if (this.hasData()) {
            let scriptBuffer = this.getBufferedScript();
            let asm = creativecoin.script.toASM(scriptBuffer);
            let dataHex = asm.replace('OP_RETURN ', '');
            dataHex = Buffer.from(dataHex, 'hex');
            let compressed = dataHex[1];
            dataHex = dataHex.slice(2);
            if (compressed) {
                return Utils.decompress(dataHex);
            } else {
                return dataHex;
            }
        }

        return null;
    }

    /**
     *
     * @return {ContentData}
     */
    getData() {
        if (this.hasData()) {
            let rawData = this.getRawData();
            return ContentData.deserialize(rawData);
        }

        return null;
    }

    /**
     *
     * @returns {string}
     */
    getDecodedScript() {
        return creativecoin.script.toASM(creativecoin.script.decompile(this.getBufferedScript()));
    }

    /**
     * @returns {Buffer}
     */
    getBufferedScript() {
        return Buffer.from(this.script, 'hex');
    }

    /**
     *
     * @returns {string}
     */
    getAddress() {
        if (creativecoin.script.pubKeyHash.output.check(this.getBufferedScript())) {
            return creativecoin.address.toBase58Check(creativecoin.script.compile(this.getBufferedScript()).slice(3, 23), this.network.scriptHash);
        } else  if (creativecoin.script.scriptHash.output.check(this.getBufferedScript())) {
            return creativecoin.address.toBase58Check(creativecoin.script.compile(this.getBufferedScript()).slice(2, 22), this.network.scriptHash);
        }

        return null;
    }
}

class TransactionBuilder {
    /**
     *
     * @param {TrantorNetwork} network
     * @param {number} feePerKb
     * @param {number} extraSize
     */
    constructor(network, feePerKb, extraSize = 0) {
        this.network = network;
        this.feePerKb = feePerKb;
        this.inputs = [];
        this.outputs = [];
        this.extraSize = extraSize;
        this.changeAddress = null;
        this.complete = false;
        this.txFee = 0;
        this.txb = null;
    }

    /**
     *
     * @param {string} address
     * @return {boolean}
     */
    isAddressInOutputs(address) {
        for (let x = 0; x < this.outputs.length; x++) {
            let out = this.outputs[x];
            if (out.address === address) {
                return true;
            }
        }

        return false;
    }

    /**
     *
     * @param {string} address
     * @param {number} amount
     * @param {boolean} isChange
     */
    addOutput(address, amount, isChange = false) {

        if (this.isAddressInOutputs(address)) {
            this.outputs.forEach(function (out) {
                if (out.address === address) {
                    out.value += amount;
                }
            });
        } else {
            let txOut = {
                address: address,
                value: amount,
                isChange: isChange
            };

            this.outputs.push(txOut);
        }
    }

    /**
     *
     * @param {string} txId
     * @param {number} index
     * @param {string} address
     * @param {number} amount
     */
    addInput(txId, index, address, amount) {
        let input = {
            txId: txId,
            vout: index,
            address: address,
            value: amount
        };

        this.inputs.push(input);
    }

    /**
     *
     * @param {Array} spendables
     */
    completeTx(spendables) {
        let that = this;
        let changeAddress = this.changeAddress;
        let feeRate = this.feePerKb / 1000;
        let {inputs, outputs, fee} = coinselect(spendables, this.outputs, feeRate, this.extraSize);

        if (!inputs || !outputs) {
            this.complete = false;
        } else {
            console.log(inputs, outputs);
            let txb = new creativecoin.TransactionBuilder(this.network);
            inputs.forEach(function (input) {
                txb.addInput(input.txId, input.vout);
                that.inputs.push(input);
            });
            outputs.forEach(function (output) {
                if (!output.address) {
                    output.address = changeAddress;
                    output.isChange = true;
                    that.addOutput(output.address, output.value, true);
                }

                txb.addOutput(output.address, output.value);
            });
            this.txb = txb;
            this.txFee = fee;
            this.complete = true;
        }
    }

    getTotalOutput(withMine = false) {
        let total = 0;
        this.outputs.forEach(function (out) {
            if (out.isChange && withMine || !out.isChange) {
                total += out.value;
            }
        });

        return total;
    }
}

class DecodedTransaction {
    constructor(rawTx, network = TrantorNetwork.MAINNET) {
        this.rawTx = rawTx.replace('\n', '');
        this.hash = '';
        this.inputs = [];
        this.outputs = [];
        this.version = 0;
        this.locktime = 0;
        this.network = network;
    }

    /**
     *
     * @param index
     * @returns {TxInput}
     */
    getInput(index) {
        return this.inputs[index];
    }

    /**
     *
     * @param index
     * @returns {TxOutput}
     */
    getOutput(index) {
        return this.outputs[index];
    }

    /**
     *
     * @return {boolean}
     */
    containsData() {
        for (let x = 0; x < this.outputs.length; x++) {
            let output = this.outputs[x];
            if (output.hasData()) {
                return true;
            }
        }

        return false;
    }

    /**
     *
     * @return {boolean}
     */
    containsRawData() {
        for (let x = 0; x < this.outputs.length; x++) {
            let output = this.outputs[x];
            if (output.hasRawData()) {
                return true;
            }
        }

        return false;
    }

    /**
     *
     * @return {Buffer}
     */
    getRawData() {
        for (let x = 0; x < this.outputs.length; x++) {
            let output = this.outputs[x];
            if (output.hasRawData()) {
                return output.getRawData();
            }
        }

        return null;
    }
    /**
     *
     * @return {ContentData}
     */
    getData() {
        for (let x = 0; x < this.outputs.length; x++) {
            let output = this.outputs[x];
            if (output.hasData()) {
                return output.getData();
            }
        }

        return null;
    }

    /**
     *
     * @param txHex
     * @returns {DecodedTransaction}
     */
    static fromHex(txHex) {
        let dtx = new DecodedTransaction(txHex);
        let tx = creativecoin.Transaction.fromHex(txHex);

        tx.ins.forEach(function (input) {
            let txInput = new TxInput(this.network, input.hash.toString('hex'), input.index, input.script.toString('hex'), input.sequence, input.witness);
            dtx.inputs.push(txInput);
        });

        tx.outs.forEach(function (output, index) {
            let txOutput = new TxOutput(this.network, output.script.toString('hex'), output.value, index);
            dtx.outputs.push(txOutput);
        });

        dtx.version = tx.version;
        dtx.locktime = tx.locktime;
        dtx.hash = tx.getId();
        return dtx;
    }
}

class Spendable {

    /**
     *
     * @param {string} txId
     * @param {number} vout
     * @param {string} address
     * @param {number} amount
     * @param {number} confirmations
     * @param {boolean} spendable
     * @param {string} scriptPubKey
     */
    constructor(txId, vout, address, amount, confirmations, spendable, scriptPubKey) {
        this.txId = txId;
        this.vout = vout;
        this.address = address;
        this.value = Coin.parseCash(amount, 'CREA').amount;
        this.confirmations = confirmations;
        this.spendable = spendable;
        this.scriptPubKey = scriptPubKey;
    }

    /**
     *
     * @param {Array} json
     * @returns {Array}
     */
    static parseJson(json) {
        let spendables = [];

        json.forEach(function (spend) {
            //Fix cant convert integer to coin, add a decimal unit to convert to float
            spend.amount = parseFloat(spend.amount) + 0.000000001;
            spendables.push(new Spendable(spend.txid, spend.vout, spend.address, spend.amount, spend.confirmations, spend.spendable, spend.scriptPubKey))
        });

        return spendables;
    }
}

if (module) {
    module.exports = {
        TxInput, TxOutput, DecodedTransaction, TransactionBuilder
    }
}