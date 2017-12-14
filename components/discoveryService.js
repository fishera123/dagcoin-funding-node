'use strict';
function DiscoveryService() {
    this.deviceManager = require('dagcoin-core/lib/deviceManager').getInstance();

    this.conf = require('byteballcore/conf.js');
    this.discoveryServicePairingCode = this.conf.discoveryServicePairingCode;
    this.eventBus = require('byteballcore/event_bus.js');
    this.device = require('byteballcore/device.js');
    this.db = require('byteballcore/db.js');
}

function connectWithDevice() {
  return self.deviceManager.makeSureDeviceIsConnected(this.discoveryServicePairingCode).then((deviceAddress) => {
    self.discoveryServiceDeviceAddress = deviceAddress;
    return Promise.resolve();
  });
}

DiscoveryService.prototype.messages = {
    startingTheBusiness: 'STARTING_THE_BUSINESS',
    aliveAndWell: 'ALIVE_AND_WELL',
    temporarilyUnavailable: 'TEMPORARILY_UNAVAILABLE',
    outOfBusiness: 'OUT_OF_BUSINESS',
    listTraders: 'LIST_TRADERS',
    updateSettings: 'UPDATE_SETTINGS'
};

DiscoveryService.prototype.init = function () {
    const self = this;
    if(conf.environment !== 'dev') {
      connectWithDevice()
    }
    return new Promise((resolve, reject) => {
      this.http.get(`http://localhost:7000/getPairingCode`, (resp) => {
        let data = '';

        // A chunk of data has been received.
        resp.on('data', (chunk) => {
          data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            const message = `COULD NOT PARSE ${data} INTO A JSON OBJECT: ${e}`;
            reject(message);
          }
        });
      }).on("error", (err) => {
        reject(`NO RESPONSE FROM THE HUB ABOUT AVAILABLE DAGCOINS: ${err.message}`);
      });
    }).then(function(code) {
      connectWithDevice()
    });
};

DiscoveryService.prototype.startingTheBusiness = function (pairCode) {
    return this.deviceManager.sendRequestAndListen(this.discoveryServiceDeviceAddress, this.messages.startingTheBusiness, { pairCode });
};

DiscoveryService.prototype.aliveAndWell = function (pairCode) {
    return this.deviceManager.sendRequestAndListen(this.discoveryServiceDeviceAddress, this.messages.aliveAndWell, { pairCode });
};

DiscoveryService.prototype.updateSettings = function (settings) {
    return this.deviceManager.sendRequestAndListen(this.discoveryServiceDeviceAddress, this.messages.updateSettings, { settings });
};

DiscoveryService.prototype.outOfBusiness = function () {
    return this.deviceManager.sendRequestAndListen(this.discoveryServiceDeviceAddress, this.messages.outOfBusiness, {});
};

module.exports = DiscoveryService;