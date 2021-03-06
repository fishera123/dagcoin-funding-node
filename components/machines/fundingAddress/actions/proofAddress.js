"use strict"

module.exports = function (properties, stateMachine, state) {
    const Action = require('dagcoin-fsm/lib/action');
    const action = new Action(properties, stateMachine, state);
    const dbManager = require('dagcoin-core/lib/databaseManager').getInstance();
    const deviceManager = require('dagcoin-core/lib/deviceManager').getInstance();
    const proofManager = require('dagcoin-core/lib/proofManager').getInstance();

    if (!properties.address) {
        throw Error(`NO address IN Action proofAddress. PROPERTIES: ${properties}`);
    }

    if (!properties.deviceAddress) {
        throw Error(`NO deviceAddress IN Action proofAddress. PROPERTIES: ${properties}`);
    }

    action.execute = function () {
        return dbManager.query(
            'SELECT address FROM dagcoin_proofs WHERE address = ? AND device_address = ? AND proofed = ?',
            [properties.address, properties.deviceAddress, 1]
        ).then((rows) => {
            if (rows && rows.length === 1) {
                // NO NEED OF FURTHER PROOFING
                return Promise.resolve();
            } else {
                return action.sendProofRequest();
            }
        });
    };

    action.sendProofRequest = function () {
        const request = {
            addresses: [properties.address]
        };

        return deviceManager.sendRequestAndListen(properties.deviceAddress, 'proofing', request).then((messageBody) => {
            const proofs = messageBody.proofs;

            console.log(`PROOFS: ${JSON.stringify(proofs)}`);

            if (!proofs || proofs.length === 0) {
                console.log(`NO PROOFS PROVIDED IN THE CLIENT RESPONSE FOR ${properties.address}`);
            }

            return Promise.resolve(proofs);
        }).then((proofs) => {
            return proofManager.proofAddressBatch(proofs, properties.deviceAddress);
        }).catch((error) => {
            console.log(`ACTION proofAddress (${JSON.stringify(properties)}) DID NOT COMPLETE SUCCESSFULLY: ${error}`);
            return Promise.resolve();
        });
    };

    return action;
};