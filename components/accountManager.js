'use strict';

let instance = null;

// My module
function AccountManager() {
    const self = this;

    self.conf = require('byteballcore/conf.js');
    self.crypto = require('crypto');
    self.device = require('byteballcore/device.js');
    self.network = require('byteballcore/network');
    self.consolidation = require('./consolidation');
    self.composer = require('byteballcore/composer.js');

    const DatabaseManager = require('./databaseManager');
    self.dbManager = DatabaseManager.getInstance();

    const ConfManager = require('./confManager');
    self.confManager = new ConfManager();

    const KeyManager = require('./keyManager');
    self.keyManager = new KeyManager();

    const WalletManager = require('./walletManager');
    self.walletManager = new WalletManager();

    self.Signer = require('./signer');
    self.Mnemonic = require('bitcore-mnemonic');

    self.passPhrase = self.conf.passPhrase;

    this.timedPromises = require('./promiseManager');

    self.paymentQueue = self.timedPromises.PromiseEnqueuer(
        'payments',
        (toAddress, amount) => {
            return self.walletManager.readSingleAddress().then((fromAddress) => {
                return self.checkThereAreStableBytes(fromAddress);
            }).then(() => {
                return self.sendPayment(toAddress, amount);
            });
        },
        self.conf.MIN_PAYMENT_DELAY,
        true
    );

    console.log(`MINIMUM PAYMENT DELAY SET TO ${self.conf.MIN_PAYMENT_DELAY} ms`);
}

AccountManager.prototype.createAccount = function () {
    console.log('COULD NOT READ THE KEY FILE, IT NEEDS TO BE GENERATED');
    const suggestedDeviceName = require('os').hostname() || 'Headless';

    let deviceName = this.conf.deviceName;

    if (!deviceName) {
        deviceName = suggestedDeviceName;
    }

    const self = this;

    let mnemonic = new self.Mnemonic(); // generates new mnemonic
    while (!self.Mnemonic.isValid(mnemonic.toString())) {
        mnemonic = new self.Mnemonic();
    }

    return this.confManager.write({deviceName: deviceName}).then(() => {
        self.deviceTempPrivKey = self.crypto.randomBytes(32);
        self.devicePrevTempPrivKey = self.crypto.randomBytes(32);
        self.mnemonicPhrase = mnemonic.phrase;

        self.keys = {
            mnemonic_phrase: self.mnemonicPhrase,
            temp_priv_key: self.deviceTempPrivKey.toString('base64'),
            prev_temp_priv_key: self.devicePrevTempPrivKey.toString('base64')
        };

        return self.keyManager.write(self.keys);
    }).then((keys) => {
        console.log('KEYS CREATED');
        self.xPrivKey = mnemonic.toHDPrivateKey(self.passPhrase);
        self.signer = new self.Signer(self.xPrivKey);

        console.log('SIGNER CREATED');
        return self.walletManager.create(self.xPrivKey).then(() => {
            console.log('RETURNING THE ACCOUNT');
            return Promise.resolve(self);
        });
    });
};

AccountManager.prototype.getSigner = function () {
    return this.signer;
};

AccountManager.prototype.getKeys = function () {
    return this.keys;
};

AccountManager.prototype.getPassPhrase = function () {
    return this.passPhrase;
};

AccountManager.prototype.getPrivateKey = function () {
    return this.xPrivKey;
};

AccountManager.prototype.getPairingCode = function () {
    return this.pairigCode;
};

AccountManager.prototype.readAccount = function () {
    const self = this;

    console.log('-----------------------');

    if (self.conf.control_addresses) {
        console.log(`REMOTE ACCESS ALLOWED FROM DEVICES: ${self.conf.control_addresses.join(', ')}`);
    }

    if (self.conf.payout_address) {
        console.log(`PAYOUTS ALLOWED TO DEVICED: ${self.conf.payout_address}`);
    }

    console.log('-----------------------');

    return self.keyManager.read().then(
        (data) => {
            self.keys = JSON.parse(data);

            const mnemonic = new self.Mnemonic(self.keys.mnemonic_phrase);
            self.xPrivKey = mnemonic.toHDPrivateKey(self.passPhrase);
            self.signer = new self.Signer(self.xPrivKey);

            return self.walletManager.exists().then((doesExist) => {
                if (doesExist) {
                    return Promise.resolve(self);
                } else {
                    return self.walletManager.create(self.xPrivKey).then(() => {
                        return Promise.resolve(self);
                    });
                }
            });
        },
        () => {
            return self.createAccount();
        }
    ).then((account) => {
        if (!account) {
            return Promise.reject('THE ACCOUNT COULD NOT BE RETRIEVED OR CREATED');
        }

        return self.walletManager.getSingle();
    }).then((walletId) => {
        console.log('PRIVATE KEY: ' + JSON.stringify(self.getPrivateKey()));
        console.log('OTHER KEYS: ' + JSON.stringify(self.getKeys()));

        self.walletId = walletId;

        const devicePrivKey = self.getPrivateKey().derive("m/1'").privateKey.bn.toBuffer({size: 32});
        self.device.setDevicePrivateKey(devicePrivKey);
        self.myDeviceAddress = self.device.getMyDeviceAddress();

        self.dbManager.query(
            "SELECT 1 FROM extended_pubkeys WHERE device_address=?",
            [self.myDeviceAddress]
        ).then((rows) => {
            if (rows.length > 1) {
                return Promise.reject("MORE THAN ONE extended_pubkey?!?");
            } else if (rows.length === 0) {
                setTimeout(function () {
                    return Promise.reject('THE PASSPHRASE IS INCORRECT');
                }, 1000);
            } else {
                return Promise.resolve();
            }
        });
    }).then(() => {
        require('byteballcore/wallet.js'); // we don't need any of its functions but it listens for hub messages

        const keys = self.getKeys();

        const mnemonic_phrase = keys.mnemonic_phrase;
        const deviceTempPrivKey = Buffer(keys.temp_priv_key, 'base64');
        const devicePrevTempPrivKey = Buffer(keys.prev_temp_priv_key, 'base64');

        const saveTempKeys = function (new_temp_key, new_prev_temp_key, onDone) {
            const processedKeys = {
                mnemonic_phrase: mnemonic_phrase,
                temp_priv_key: deviceTempPrivKey.toString('base64'),
                prev_temp_priv_key: devicePrevTempPrivKey.toString('base64')
            };
            self.keyManager.write(processedKeys).then(() => onDone);
        };

        self.device.setTempKeys(deviceTempPrivKey, devicePrevTempPrivKey, saveTempKeys);
        self.device.setDeviceName(self.conf.deviceName);
        self.device.setDeviceHub(self.conf.hub);

        self.myDevicePubkey = self.device.getMyDevicePubKey();
        console.log(`====== my device address: ${self.myDeviceAddress}`);
        console.log(`====== my device pubkey: ${self.myDevicePubkey}`);

        if (self.conf.permanent_pairing_secret) {
            self.pairigCode = `${self.myDevicePubkey}@${self.conf.hub}#${self.conf.permanent_pairing_secret}`;
            console.log(`====== my pairing code: ${self.pairigCode}`);
        }

        if (self.conf.bLight) {
            const light_wallet = require('byteballcore/light_wallet.js');
            light_wallet.setLightVendorHost(self.conf.hub);
        }

        if (self.conf.MAX_UNSPENT_OUTPUTS && self.conf.CONSOLIDATION_INTERVAL) {
            const consolidate = () => {
                if (!self.network.isCatchingUp()) {
                    self.consolidation.consolidate(self.walletId, self.getSigner());
                }
            };
            setInterval(consolidate, self.conf.CONSOLIDATION_INTERVAL);
            setTimeout(consolidate, 300 * 1000);
        }

        return new Promise((resolve) => {
            //LISTENS FOR UPDATES FOR 2 SECONDS BEFORE DOING ANYTHING
            setTimeout(function () {
                console.log('ACCOUNT READY');
                resolve();
            }, 2000);
        });
    });
};

AccountManager.prototype.sendPayment = function (toAddress, amount) {
    const self = this;

    const signer = self.getSigner();

    if (!signer) {
        return Promise.reject('THE SIGNER IS NOT DEFINED. USE THIS METHOD ONLY AFTER LOADING THE ACCOUNT WITH readAccount');
    }

    return self.walletManager.readSingleAddress().then((fromAddress) => {
        return new Promise((resolve, reject) => {
            const onError = (err) => {
                reject(`COULD NOT DELIVER ${amount} BYTES TO ${toAddress} BECAUSE: ${err}`);
            };

            const callbacks = self.composer.getSavingCallbacks({
                ifNotEnoughFunds: onError,
                ifError: onError,
                ifOk: function (objJoint) {
                    self.network.broadcastJoint(objJoint);
                    resolve(objJoint);
                }
            });

            // i.e.: "LS3PUAGJ2CEYBKWPODVV72D3IWWBXNXO"
            const payee_address = toAddress;
            const arrOutputs = [
                {address: fromAddress, amount: 0},      // the change
                {address: payee_address, amount: amount}  // the receiver
            ];

            self.composer.composePaymentJoint([fromAddress], arrOutputs, signer, callbacks);
        });
    });
};

AccountManager.prototype.sendPaymentSequentially = function (toAddress, amount) {
    console.log(`ENQUEUEING A NEW PAYMENT TO ${toAddress} OF ${amount} BYTES`);
    return this.paymentQueue.enqueue(toAddress, amount);
};

AccountManager.prototype.checkThereAreStableBytes = function (fromAddress) {
    const self = this;

    console.log(`CHECKING HOW MANY BYTES ARE STABLE ON THE MAIN FUNDING ADDRESS (${fromAddress}) BEFORE MAKING A PAYMENT`);

    return self.dbManager.query(
        `SELECT asset, address, is_stable, SUM(amount) AS balance
        FROM outputs CROSS JOIN units USING(unit)
        WHERE is_spent=0 AND sequence='good' AND address = ?
        GROUP BY asset, address, is_stable
        UNION ALL
        SELECT NULL AS asset, address, 1 AS is_stable, SUM(amount) AS balance FROM witnessing_outputs
        WHERE is_spent=0 AND address = ? GROUP BY address
        UNION ALL
        SELECT NULL AS asset, address, 1 AS is_stable, SUM(amount) AS balance FROM headers_commission_outputs
        WHERE is_spent=0 AND address = ? GROUP BY address`,
        [fromAddress, fromAddress, fromAddress]
    ).then((rows) => {
        let totalStableAmount = 0;

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];

            if (row.asset || !row.is_stable) {
                continue;
            }

            totalStableAmount += row.balance;
        }

        if (totalStableAmount >= self.conf.MIN_STABLE_BYTES_ON_MAIN_BEFORE_FUNDING) {
            console.log(`ENOUGH STABLE BYTES ON THE MAIN FUNDING NODE ADDRESS (${fromAddress}) FOR A PAYMENT`);
            return Promise.resolve(true);
        } else {
            return new Promise((resolve) => {
                console.log(`NOT ENOUGH STABLE BYTES ON ${fromAddress}. ` +
                    `WAITING ${self.conf.MAIN_ADDRESS_FUNDS_INSPECTION_PERIOD} ms BEFORE CHECKING AGAIN ...`);
                setTimeout(resolve, self.conf.MAIN_ADDRESS_FUNDS_INSPECTION_PERIOD);
            }).then(() => {
                return self.checkThereAreStableBytes(fromAddress);
            });
        }
    });
};

/**
 * Takes all bytes from a shared address and sends them to the main address. It works only if the definition of the shared address
 * allows full controls to the funding main address (shared address defined since October, 10th).
 *
 * The following definition allows BCS55XCV5RIJWXJWVGFLDRMWKKXRUVCS to control the shared address.
 * ["or",[["address","BCS55XCV5RIJWXJWVGFLDRMWKKXRUVCS"],["and",[["address","BCS55XCV5RIJWXJWVGFLDRMWKKXRUVCS"],["address","4SQ5PP7Z7LYIDLOCXRPXXTR5M3K6L66I"]]]]]
 * @param toBeEmptiedAddress A shared address to be emptied.
 * @returns {*} A promise containing the generated payment joint or the rejection reason.
 */
AccountManager.prototype.emptySharedAddress = function (toBeEmptiedAddress) {
    const self = this;

    const signer = self.getSigner();

    if (!signer) {
        return Promise.reject('THE SIGNER IS NOT DEFINED. USE THIS METHOD ONLY AFTER LOADING THE ACCOUNT WITH readAccount');
    }

    return self.walletManager.readSingleAddress().then((toAddress) => {
        return new Promise((resolve, reject) => {
            const onError = (err) => {
                reject(`COULD NOT DELIVER ${amount} BYTES TO ${toAddress} BECAUSE: ${err}`);
            };

            const callbacks = self.composer.getSavingCallbacks({
                ifNotEnoughFunds: onError,
                ifError: onError,
                ifOk: function (objJoint) {
                    self.network.broadcastJoint(objJoint);
                    resolve(objJoint);
                }
            });

            const arrOutputs = [
                {address: toAddress, amount: 0}  // the receiver
            ];

            self.composer.composeJoint({
                send_all: true,
                paying_addresses: [toBeEmptiedAddress],
                shared_addresses: [toBeEmptiedAddress],
                outputs: arrOutputs,
                signer: signer,
                callbacks: callbacks
            });
        });
    });
};

module.exports = AccountManager;
module.exports.getInstance = function () {
    if (!instance) {
        instance = new AccountManager();
    }

    return instance;
};