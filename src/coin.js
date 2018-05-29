class CoinUri {

    /**
     *
     * @param {string} address
     * @param {string} amount
     * @param {string} label
     * @param {string} message
     */
    constructor(address, amount, label, message) {
        this.address = address;
        this.amount = amount;
        this.label = label;
        this.message = message;
    }

    /**
     * @return {string}
     */
    toString() {
        let uri = 'creativecoin:';
        let hasAmount = this.amount && this.amount > 0;
        let hasLabel = this.label && this.label.length > 0;
        let hasMessage = this.message && this.message.length > 0;
        let addedFirst = false;

        if (this.address) {
            uri += this.address;
        }

        if (hasAmount || hasLabel || hasMessage) {
            uri += '?';
        }

        if (hasAmount) {
            uri += addedFirst ? '&' : '';
            uri += 'amount=' + this.amount;
            addedFirst = true;
        }

        if (hasLabel) {
            uri += addedFirst ? '&' : '';
            uri += 'label=' + encodeURIComponent(this.label);
            addedFirst = true;
        }

        if (hasMessage) {
            uri += addedFirst ? '&' : '';
            uri += 'message=' + encodeURIComponent(this.message);
        }

        return uri;
    }
}

class Currency {
    constructor(name, code, symbol, scale) {
        this.name = name;
        this.code = code;
        this.symbol = symbol;
        this.scale = scale;
    };

    getName() {
        return this.name;
    };

    getCode() {
        return this.code;
    };

    getSymbol() {
        return this.symbol;
    };

    getScale() {
        return this.scale;
    };

    /**
     *
     * @param currency
     * @returns {Currency}
     */
    static parseCurrency(currency) {
        if (currency.code && currency.symbol && currency.name) {
            currency = currency.code.toUpperCase();
        }

        if (typeof currency === 'string') {
            currency = currency.toUpperCase();

            switch (currency) {
                case '€':
                case 'EURO':
                case 'EUR':
                    return new Eur();
                case '$':
                case 'DOLLAR':
                case 'USD':
                    return new Usd();
                case 'MXN':
                case 'PESO':
                    return new Mxn();
                case 'ZŁ':
                case 'ZLOTI':
                case 'PLN':
                    return new Pln();
                case 'BTC':
                case 'BITCOIN':
                    return new Btc();
                case 'CREA':
                case 'CREATIVECOIN':
                    return new Crea();
                default:
                    return new UnknownCurrency();
            }
        } else if (currency instanceof Currency) {
            return currency;
        }

        return new UnknownCurrency();
    };

    /**
     *
     * @param amount
     * @param price
     * @returns {Coin}
     */
    static convert(amount, price) {
        let amountConverted = (amount.amount * price.amount) / Math.pow(10, amount.currency.scale + price.currency.scale);
        return Coin.parseCash(amountConverted, price.currency);
    }
}

class UnknownCurrency extends Currency {

    constructor() {
        super('unknow', 'UNK', 'UNK', 0);
    }
}

class FiatCurrency extends Currency {

    constructor(name, code, symbol) {
        super(name, code, symbol, 2);
    }
}

class CryptoCurrency extends Currency {
    constructor(name, code, symbol) {
        super(name, code, symbol, 8);
    }
}

class Eur extends FiatCurrency {
    constructor() {
        super('euro', 'EUR', '€');
    }
}

class Usd extends FiatCurrency {
    constructor() {
        super('dollar', 'USD', '$');
    }
}

class Mxn extends FiatCurrency {
    constructor() {
        super('peso', 'MXN', 'MXN');
    }
}

class Pln extends FiatCurrency {
    constructor() {
        super('zloti', 'PLN', 'zł');
    }
}

class Btc extends CryptoCurrency {
    constructor() {
        super('bitcoin', 'BTC', 'BTC');
    }
}

class Crea extends CryptoCurrency {
    constructor() {
        super('creativecoin', 'CREA', 'CREA');
    }
}

Currency.EUR = new Eur();
Currency.MXN = new Mxn();
Currency.USD = new Usd();
Currency.PLN = new Pln();
Currency.BTC = new Btc();
Currency.CREA = new Crea();

class Coin {
    constructor(currency, amountInCents) {
        this.amount = amountInCents;
        this.currency = currency;
    };

    add(amount) {
        if (amount instanceof Coin && amount.currency === this.currency) {
            amount = amount.amount;
            this.amount = this.amount + amount;
        } else if (typeof amount === 'number') {
            this.amount = this.amount + amount;
        }
    };

    subtract(amount) {
        if (amount instanceof Coin && amount.currency === this.currency) {
            amount = amount.amount;
            this.amount = this.amount - amount;
        } else if (typeof amount === 'number') {
            this.amount = this.amount - amount;
        }
    };

    multiply(amount) {
        if (amount instanceof Coin && amount.currency === this.currency) {
            amount = amount.amount;
            this.amount = this.amount * amount;
        } else if (typeof amount === 'number') {
            this.amount = this.amount * amount;
        }
    };

    divide(amount) {
        if (amount instanceof Coin && amount.currency === this.currency) {
            amount = amount.amount;
            this.amount = this.amount / amount;
        } else if (typeof amount === 'number') {
            this.amount = this.amount / amount;
        }
    };

    /**
     *
     * @return {*|boolean}
     */
    isZero() {
        return !this.amount || this.amount === 0;
    }

    /**
     *
     * @return {*|boolean}
     */
    isNegative() {
        return this.amount && this.amount < 0;
    }

    /**
     *
     * @returns {number}
     */
    getScaleValue() {
        return this.amount / Math.pow(10, this.currency.getScale());
    };

    /**
     *
     * @returns {number}
     */
    getAmount() {
        return this.amount;
    };

    /**
     *
     * @returns {Currency}
     */
    getCurrency() {
        return this.currency;
    };

    /**
     *
     * @param maxDecimals
     * @returns {string}
     */
    toPlainString(maxDecimals) {

        if (isNaN(maxDecimals)) {
            maxDecimals = this.currency.getScale();
        }

        let mf = new MonetaryFormat();
        mf.digits(maxDecimals);
        return mf.format(Math.abs(this.amount), this.currency.getScale());
    };

    toFriendlyString(maxDecimals) {
        return this.toPlainString(maxDecimals) + " " + this.currency.getSymbol();
    };

    toString() {
        return this.toFriendlyString(this.currency.getScale());
    };

    /**
     *
     * @param amount
     * @param currency
     * @returns {Coin}
     */
    static parseCash(amount, currency) {
        currency = Currency.parseCurrency(currency);
        let isNumber = typeof amount === 'number';
        if (isNumber) {
            let isDecimal = isNumber && amount.toString().indexOf('.') > 0;

            let rounded = 0;

            if (!isDecimal) {
                rounded = currency.getScale();
            }

            amount = Math.round(amount * Math.pow(10, currency.getScale() - rounded));
        } else if (typeof amount === 'string' && !isNaN(amount)) {
            amount = amount.replace(',', '.');
            if (amount.indexOf('.') > 0) {
                return Coin.parseCash(parseFloat(amount), currency);
            }

            return Coin.parseCash(parseInt(amount), currency);
        } else {
            amount = 0;
        }


        switch (currency.code) {
            case 'EUR':
                return new EurCoin(amount);
            case 'USD':
                return new DollarCoin(amount);
            case 'MXN':
                return new PesoCoin(amount);
            case 'PLN':
                return new ZlotiCoin(amount);
            case 'BTC':
                return new BitCoin(amount);
            case 'CREA':
                return new CreativeCoin(amount);
            default:
                return new Coin(currency, amount);
        }
    }
}

class MonetaryFormat {
    constructor() {
        this.maxDigits = 2;
    };

    digits(maxDigits) {

        if (isNaN(maxDigits)) {
            maxDigits = 2;
        }

        this.maxDigits = maxDigits;
    };

    /**
     *
     * @param {Number} value
     * @param {Number} exponent
     * @returns {string}
     */
    format(value, exponent) {
        if (typeof value !== "number") {
            value = 0;
        }

        if (typeof exponent !== "number") {
            exponent = 2;
        }

        let toFloat = (value / Math.pow(10, exponent)).toFixed(this.maxDigits);
        return String(toFloat);
    };
}

class CryptoCoin extends Coin {
    constructor(currency, amountInCents) {
        super(currency, amountInCents);
    }

    toPlainString(maxDigits) {
        if (isNaN(maxDigits)) {
            maxDigits = this.currency.getScale();
        }

        let digits = maxDigits;
        let stringNumber = (this.amount / Math.pow(10, this.currency.getScale())).toFixed(this.currency.getScale());
        let parts = stringNumber.split('.');
        let decimal = String(parts[1]);

        if (decimal.charAt(0) !== '0') {
            let decimalString = String(parseInt(decimal));
            digits = decimalString.length;

            if (digits > maxDigits) {
                digits = maxDigits;
            }
        } else {
            digits = this.currency.getScale();
        }

        let mf = new MonetaryFormat();
        mf.digits(digits);
        return mf.format(Math.abs(this.amount), this.currency.getScale());
    };
}

class EurCoin extends Coin {
    constructor(amountInCents) {
        super(new Eur(), amountInCents);
    }
}

class BitCoin extends CryptoCoin {
    constructor(amountInCents) {
        super(new Btc(), amountInCents);
    }
}

class CreativeCoin extends CryptoCoin {
    constructor(amountInCents) {
        super(new Crea(), amountInCents);
    }
}

class DollarCoin extends Coin {
    constructor(amountInCents) {
        super(new Usd(), amountInCents);
    }
}

class PesoCoin extends Coin {
    constructor(amountInCents) {
        super(new Mxn(), amountInCents);
    }
}

class ZlotiCoin extends Coin {
    constructor(amountInCents) {
        super(new Pln(), amountInCents);
    }
}

if (module) {
    module.exports = {CoinUri, Currency, FiatCurrency, CryptoCurrency, UnknownCurrency, Btc, Pln, Usd, Mxn, Eur, MonetaryFormat, Coin,
        CryptoCoin, BitCoin, CreativeCoin, EurCoin, DollarCoin, PesoCoin, ZlotiCoin}
}