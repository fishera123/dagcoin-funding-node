/*jslint node: true */
"use strict";

const dbManager = require('dagcoin-core/lib/databaseManager').getInstance();
const promiseManager = require('dagcoin-core/lib/promiseManager');
const eventBus = require('byteballcore/event_bus');

const tag = 'transferSharedAddressesToFundingTable';

function execute() {
    return dbManager.query(            `
            INSERT INTO dagcoin_funding_addresses (
              shared_address,
              master_address,
              master_device_address,
              definition_type,
              status,
              created
            )
            SELECT
              sa.shared_address,
              sasp.address,
              sasp.device_address,
              (sa.definition LIKE '%or%') + 1 as definition_type,
              'NOT_PROOFED' as status,
              CURRENT_TIMESTAMP as created
            FROM
              shared_addresses sa,
              shared_address_signing_paths sasp 
              left join dagcoin_proofs dp on dp.address =  sasp.address
            WHERE
                sa.shared_address = sasp.shared_address
            AND sasp.address NOT IN (SELECT address FROM my_addresses)
            AND sa.shared_address NOT IN (SELECT shared_address FROM dagcoin_funding_addresses);`,
        []
    ).then((rows) => {
        console.log(`QUERY RESULT OF ROUTINE ${tag}: ${JSON.stringify(rows)}`);

        return dbManager.query(
            `SELECT 
            shared_address, master_address, master_device_address, definition_type, status, created, last_status_change, previous_status
        FROM dagcoin_funding_addresses WHERE status = ?`, ['NOT_PROOFED']
        );
    }).then((fundingAddresses) => {
        if (!fundingAddresses || fundingAddresses.length == 0) {
            console.log('NO NEW FUNDING ADDRESSES TO FOLLOW');
            return Promise.resolve();
        }

        eventBus.emit('internal.dagcoin.addresses-to-follow', fundingAddresses);
    });
}

exports.start = (delay, period) => {
    setTimeout(() => {
        promiseManager.loopMethod(tag, period, execute);
    }, delay);
};
