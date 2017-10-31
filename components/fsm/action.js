"use strict"

function Action(properties, stateMachine, state) {
    if (!properties) {
        throw 'MISSING properties IN Action. THERE SHOULD BE AT LEAST A NAME {name: \'action-name\'}';
    }

    if (properties.stateMachine != null) {
        throw Error ('PROPERTY stateMachine IS RESERVED FOR INTERNAL USE');
    }

    if (properties.state != null) {
        throw Error ('PROPERTY state IS RESERVED FOR INTERNAL USE');
    }

    if (stateMachine == null) {
        throw Error (`PROPERTY stateMachine IS NOT SET IN Action ${properties.name}`);
    }

    this.stateMachine = stateMachine;

    if (state == null) {
        throw Error (`PROPERTY state IS NOT SET IN Action ${properties.name}`);
    }

    this.state = state;

    for (let property in properties) {
        this[property] = properties[property];
    }

    if (!this.name) {
        throw 'MISSING properties.name IN A Action. IT IS A MANDATORY PROPERTY';
    }

    if (this.parameters && this.parameters.constructor !== Array) {
        throw 'PROPERTY properties.parameters IS SET BUT IS NOT AS AN ARRAY. IT MUST BE AN ARRAY. I.E.: [\'param\']';
    }
}

Action.prototype.call = function () {
    const self = this;

    if (typeof self.execute !== 'function') {
        throw `Action DEFINED WITHOUT METHOD execute: ${JSON.stringify(self)}`;
    }

    if (self.parameters) {
        if (self.parameters.constructor !== Array) {
            throw `Action ${self.name} PROPERTY parameters IS SET BUT NOT AN ARRAY. CHECK THE DEFINITION : ${JSON.stringify(self)}`;
        }
    }

    return self.execute.apply(self, self.parameters, self.stateMachine, self.state);
};

Action.prototype.getName = function () {
    return this.name;
};

Action.prototype.setStateMachine = function (stateMachine) {
    if (!stateMachine) {
        throw 'MISSING PARAMETER stateMachine';
    }

    this.stateMachine = stateMachine;
};

module.exports = function (properties, stateMachine, state) {
    return new Action(properties, stateMachine, state);
};