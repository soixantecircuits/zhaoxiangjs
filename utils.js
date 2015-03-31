'use strict';
module.exports = {
  // TODO: process mdns erros
  connectToService: function(servicename, callback) {
    var mdns = require('mdns');
    var _ = require('lodash');
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
  },

  slackit: function(er){
    var request = require('request');
    var config = require('./config/config.json');
    var host = require("os").hostname();
    var payload1 = {
      "channel"    : config.slack.channel,
      "username"   : host,
      "text"       : config.slack.text + " " + er ,
      "icon_emoji" : ":ghost:"
    };

    var options = {
      uri: "https://hooks.slack.com/services/" + config.slack.token,
      form:  JSON.stringify( payload1 )
    };
    request.post(options, function(error, response, body){
      if (!error && response.statusCode == 200) {
        console.log("Slack success: " + body.name);
      } else {
        console.log('error: '+ response.statusCode + body);
      }
    });
  },

  restart_usb: function() {
    var exec = require('child_process').exec;
    console.log("resetting usb");
    exec('bash reset_device.sh ' + camera.port, function(error, stdout, stderr) {
      console.log('stdout: ' + stdout);
      console.log('stderr: ' + stderr);
      if (error !== null) {
        console.log('exec error: ' + error);
      }
    });
  }

};
