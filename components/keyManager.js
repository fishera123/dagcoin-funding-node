'use strict';

// My module
function KeyManager () {
	this.conf = require('byteballcore/conf.js');
	this.fs = require('fs');
	this.crypto = require('crypto');
	this.desktopApp = require('byteballcore/desktop_app.js');
	this.applicationDataDirectory = this.desktopApp.getAppDataDir();
	this.keyFileName = `${this.applicationDataDirectory}/${(this.conf.KEYS_FILENAME || 'keys.json')}`;

	const ConfManager = require('./confManager');
	this.confManager = new ConfManager();
}

KeyManager.prototype.read = function() {
	const self = this;

	return new Promise((resolve, reject) => {
        try {
			self.fs.readFile(self.keyFileName, 'utf8', function(err, data){
				if (err) {
					reject(err);
				} else {
					resolve(data);
				}
			});
        } catch (e) {
            reject(new Error(`WHILE READING FROM FILE ${self.keyFileName}: ${e.message}`));
        }
	});
};

KeyManager.prototype.write = function (keys) {
	const self = this;

	return new Promise((resolve, reject) => {
		try {
            self.fs.writeFile(self.keyFileName, JSON.stringify(keys, null, '\t'), 'utf8', function (err) {
                if (err) {
                    reject(`COULD NOT WRITE THE KEY FILE: ${err}`);
                } else {
                    resolve(keys);
                }
            });
        } catch (e) {
			reject(new Error(`WHILE WRITING ${JSON.stringify(keys, null, '\t')} TO FILE ${self.keyFileName}: ${e.message}`));
		}
	});
};

module.exports = KeyManager;