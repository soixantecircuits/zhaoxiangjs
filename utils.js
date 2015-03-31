'use strict';
module.exports = {
  connectToService: function(servicename, callback) {
    var mdns = require('mdns');
    var services = [];
    var browser = mdns.createBrowser(mdns.tcp(servicename));
    browser.on('serviceUp', function(service) {
        console.log("service up: ", service.type.name);
        if (_.findWhere(services, {name:service.type.name, host:service.host.substr(0, service.host.length - 1), port:service.port}) === undefined) {
        console.log('New socket.io connection with service "' + service.type.name + '" on: '+service.host.substr(0, service.host.length - 1)+':'+service.port);
        services.push({name:service.type.name, host:service.host.substr(0, service.host.length - 1), port:service.port});
        callback(null,service.host.substr(0, service.host.length - 1), service.port);
        }
        });
    browser.on('serviceDown', function(service) {
        console.log("service down: ", service.type.name);
        });
    browser.start();
  }
};
