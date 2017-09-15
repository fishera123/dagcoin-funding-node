function FundingExchangeProvider (pairingString) {
    this.conf = require('byteballcore/conf.js');

    this.exchangeFee = this.conf.exchangeFee;
    this.totalBytes = this.conf.totalBytes;
    this.bytesPerAddress = this.conf.bytesPerAddress;
    this.maxEndUserCapacity = this.conf.maxEndUserCapacity;

    this.active = false;
    this.pairingString = pairingString;

    const DiscoveryService = require('./submodules/discoveryService');
    this.discoveryService = new DiscoveryService();
}

FundingExchangeProvider.prototype.activate = function () {
    if (this.active) {
        return Promise.resolve();
    }

    return this.discoveryService.startingTheBusiness();

    const self = this;

    return new Promise((resolve, reject) => {
        const sendMessPromise = discoveryService.sendMessage(discoveryService.messages.startingTheBusiness);
        const setSettingsPromise = sendMessPromise.then(() => setSettings(settings));
        const aliveAndWellPromise = setSettingsPromise.then(() => aliveAndWell());

        return aliveAndWellPromise.then(() => {
            messageInterval = setInterval(() => {
                aliveAndWell().then(() => {
                }, err => console.log(err));
            }, messageIntervalTimeout);
        });
    });
}

/* eslint-disable import/no-dynamic-require */
(function () {
    'use strict';

    angular.module('copayApp.services')
        .factory('fundingExchangeProviderService', ($q, $rootScope, discoveryService, fileSystemService, configService) => {
            const self = {};

            const settings = {
                exchangeFee: 0.001,
                totalBytes: 100000,
                bytesPerAddress: 10000,
                maxEndUserCapacity: 10
            };

            let messageIntervalTimeout = 5 * 60 * 1000;
            let fundingNode = false;

            let messageInterval = null;
            let assocBalances = null;

            self.canEnable = canEnable;
            self.deactivate = deactivate;
            self.activate = activate;
            self.getSettings = getSettings;
            self.setSettings = setSettings;
            self.getUserConfig = getUserConfig;

            // TODO: refine this logic to keep in account funding limits, resource availability and all parameters
            const eventBus = require('byteballcore/event_bus.js');
            eventBus.on('dagcoin.is-funding-available', (message, fromAddress) => {
                const reply = {
                    protocol: 'dagcoin',
                    title: 'funding-available',
                    status: true
                };

                const device = require('byteballcore/device.js');
                device.sendMessageToDevice(fromAddress, 'text', JSON.stringify(reply));
            });

            // One device can send such message to check whether another device can exchange messages
            // TODO: move to correspondentListService as soon as this feature is available
            eventBus.on('dagcoin.is-connected', (message, fromAddress) => {
                const reply = {
                    protocol: 'dagcoin',
                    title: 'connected'
                };

                const device = require('byteballcore/device.js');
                device.sendMessageToDevice(fromAddress, 'text', JSON.stringify(reply));
            });

            function getUserConfig() {
                try {
                    const config = configService.getSync();
                    return config;
                } catch (e) {
                    return {}; // empty config
                }
            }

            function aliveAndWell() {

                const def = $q.defer();
                const device = require('byteballcore/device.js');

                device.startWaitingForPairing((pairingInfo) => {
                    const code = `${pairingInfo.device_pubkey}@${pairingInfo.hub}#${pairingInfo.pairing_secret}`;

                    discoveryService.sendMessage(discoveryService.messages.aliveAndWell, {pairCode: code}).then(def.resolve, def.reject);
                });

                return def.promise;
            }

            function activate() {
                if (fundingNode) {
                    return $q.resolve();
                }

                const sendMessPromise = discoveryService.sendMessage(discoveryService.messages.startingTheBusiness);
                const setSettingsPromise = sendMessPromise.then(() => setSettings(settings));
                const aliveAndWellPromise = setSettingsPromise.then(() => aliveAndWell());

                return aliveAndWellPromise.then(() => {
                    messageInterval = setInterval(() => {
                        aliveAndWell().then(() => {
                        }, err => console.log(err));
                    }, messageIntervalTimeout);
                });
            }

            function deactivate() {
                if (fundingNode) {
                    if (messageInterval) {
                        clearInterval(messageInterval);
                    }

                    return discoveryService.sendMessage(discoveryService.messages.outOfBusiness);
                }

                return $q.resolve();
            }

            function canEnable() {
                const d = $q.defer();

                function isLatestVersion() {
                    const def = $q.defer();

                    // todo funding node is stub
                    def.resolve(true);

                    return def.promise;
                }

                function hasBytes() {
                    const def = $q.defer();

                    if (assocBalances && assocBalances.base && parseInt(assocBalances.base.stable, 10) > 0) {
                        def.resolve(true);
                    } else {
                        def.resolve(false);
                    }

                    return def.promise;
                }

                const isLatestVersionPromise = isLatestVersion();
                const hasBytesPromise = hasBytes();

                $q.all([isLatestVersionPromise, hasBytesPromise]).then((results) => {
                    const successResults = results.filter(item => item);
                    if (successResults.length !== results.length) {
                        d.reject();
                        return;
                    }

                    d.resolve();
                });

                return d.promise;
            }

            function getSettings() {
                return angular.copy(settings);
            }

            function setSettings(newSettings) {
                return discoveryService.sendMessage(discoveryService.messages.updateSettings, {settings: newSettings}).then(() => {
                    settings.exchangeFee = newSettings.exchangeFee;
                    settings.totalBytes = newSettings.totalBytes;
                    settings.bytesPerAddress = newSettings.bytesPerAddress;
                    settings.maxEndUserCapacity = newSettings.maxEndUserCapacity;

                    updateConfig();
                });
            }

            return self;
        });
}());

module.exports = FundingExchangeProvider;