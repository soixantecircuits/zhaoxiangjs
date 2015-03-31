'use strict';
(function() {

  var util = require('util');
  var fs = require('fs');
  var _ = require('lodash');

  var GPhoto = require('gphoto2');
  var express = require('express');
  var bodyParser = require('body-parser');
  var mkdirp = require('mkdirp');
  var io = require('socket.io-client');
  var has = require('deep-has');
  var diff = require('deep-diff').diff;

  var config = require('./config/config.json');
  var utils = require('./utils');

  var app, camera, gphoto, id, logRequests, name, preview_listeners, requests, _ref;
  var argv = require('minimist')(process.argv.slice(2));
  var lastPicture;
  var is_streaming = false;
  var last_error = 0;

  process.title = 'zhaoxiangjs';

  gphoto = new GPhoto.GPhoto2();

  requests = {};

  preview_listeners = [];

  camera = void 0;


  var host = require("os").hostname();
  try {
    var cam_id = host.match(/voldenuit(.*)/)[1];
  } catch (err) {
    //console.log(err);
    console.log('Apparently this computer is not in the team, check your hostname.');
  }

  mkdirp('/tmp/stream', function(err) {
    if (err) console.error(err)
  });
  mkdirp('/tmp/snaps', function(err) {
    if (err) console.error(err)
  });

  utils.slackit();

  var on_error = function(er) {
    // TODO: socketio error retrieve, to see it in the logs of nuwa
    last_error = er;
    console.error("error code: " + er);
    if (last_error == -7) {
      console.error("Can't connect to camera, exiting");
      process.exit(-1);
    }
    else if (last_error == -1) {
      console.error("Exiting because -1 error causes an error of retrieving the last picture at next shoot");
    }
    slackit(er);
    setTimeout(function(){process.exit(-1);},1000);
  }
  gphoto.list(function(cameras) {
    camera = _(cameras).chain().filter(function(camera) {
      return camera.model.match(/(Canon|Nikon)/);
    }).first().value();
    //if (camera)
      //console.log("found " + cameras.length + " cameras");
    if (!camera && !argv.f) {
      console.log('Exit - no camera found, sorry. :(');
      process.exit(-1);
    } else if (camera) {
      console.log("port: " + camera.port);
      console.log("loading " + camera.model + " settings");
      // TODO: uniform error handling
      return camera.getConfig(function(er, settings) {
        if (er) {
          last_error = er;
          console.log(er);
          console.error({
            camera_error: er
          });

          utils.restart_usb();
          process.exit(-1);
        }
        return console.log(settings);
      });
    }
  });

  utils.connectToService(config.servicelookup.name, function socketioInit(err, address, port) {
    var socket = io('http://' + address + ':' + port);
    socket
      .on('connect', function() {
        console.log('socketio connected.');
      })
      .on('shoot', function(snap_id) {
        if (!camera) {
          on_error(er);
        } else {
          return camera.takePicture({
            download: true,
            targetPath: '/tmp/snaps/snap-' + snap_id + '-' + cam_id + '-XXXXXXX'
          }, function(er, data) {
              if (er) {
                on_error(er);
              } else {
                lastPicture = data;
                console.log('lastPicture: ' + lastPicture);
              }
            });
        }
      });
  });


  app = express();

  app.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  });

  app.use(express["static"](__dirname + '/public'));

  //app.use(express.bodyParser());
  app.use(bodyParser.urlencoded({
    extended: false
  }));
  app.use(bodyParser.json());

  app.engine('.html', require('jade').__express);

  app.get('/', function(req, res) {
    return res.render('index.html');
  });

  logRequests = function() {
    var d, fps;
    d = Date.parse(new Date()) / 1000;
    if (requests[d] > 0) {
      return requests[d]++;
    } else {
      fps = requests[d - 1];
      requests = {};
      requests[d] = 1;
      if (fps) {
        return console.log(fps + " fps");
      }
    }
  };

  app.get('/api/status', function(req, res) {
    var model = 'Not connected';
    if (camera)
      model = camera.model;
    var camera_stuck = false;
    if (last_error == -7)
      camera_stuck = true;
    var status = {
      camera: model,
      isStreaming: is_streaming,
      last_error: last_error,
      camera_stuck: camera_stuck
    }
    res.status(200).json(status);
  });

  app.get('/api/shoot/', function(req, res) {
    if (!camera) {
      return res.send(404, 'Camera not connected');
    } else {
      return camera.takePicture({
        targetPath: '/tmp/foo.XXXXXXX'
      }, function(er, data) {
          if (er) {
            on_error(er);
            return res.send(404, er);
          } else {
            lastPicture = data;
            console.log('lastPicture: ' + lastPicture);
            return res.send(lastPicture);
          }
        });
    }
  });

  app.get('/api/shoot/:format', function(req, res) {
    if (!camera) {
      return res.send(404, 'Camera not connected');
    } else {
      return camera.takePicture({
        targetPath: '/tmp/foo.XXXXXXX'
      }, function(er, data) {
          if (er) {
            on_error(er);
            return res.send(404, er);
          } else {
            lastPicture = data;
            return res.send('/api/lastpicture/' + req.params.format);
          }
        });
    }
  });

  app.get('/api/lastpicture/', function(req, res) {
    var format = (req.params.format != null) ? req.params.format : 'jpeg';
    res.header('Content-Type', 'text/plain');
    console.log('lastPicture: ' + lastPicture);
    return res.send(lastPicture);
  });

  app.get('/api/lastpicture/:format', function(req, res) {
    fs.readFile(lastPicture, function(er, data) {
      if (er) {
        return res.send(404, er);
      } else {
        res.header('Content-Type', 'image/' + req.params.format);
        return res.send(data);
      }
    });
  });

  app.get('/api/settings/:name', function(req, res) {
    if (!camera) {
      return res.send(404, 'Camera not connected');
    } else {
      camera.getConfig(function(er, settings) {
        if (er) {
          on_error(er);
          return res.send(404, JSON.stringify(er));
        } else {
          var setting = has(settings, req.params.name);
          return res.send(_.values(has(setting, 'value')[0])[0]);
        }
      });
    }
  });

  app.put('/api/settings/:name', function(req, res) {
    if (!camera) {
      return res.send(404, 'Camera not connected');
    } else {
      return camera.setConfigValue(req.params.name, req.body.newValue, function(er) {
        if (er) {
          on_error(er);
          return res.send(404, JSON.stringify(er));
        } else {
          return res.send(200);
        }
      });
    }
  });

  app.get('/api/settings', function(req, res) {
    if (!camera) {
      return res.send(404, 'Camera not connected');
    } else {
      return camera.getConfig(function(er, settings) {
        return res.send(JSON.stringify(settings));
      });
    }
  });

  app.put('/api/settings', function(req, res) {
    if (!camera) {
      return res.send(404, 'Camera not connected');
    } else {
      var _settings = JSON.parse(req.body.settings);
      camera.getConfig(function(err, settings) {
        if (err) {
          console.log(err);
        } else {
          var diffs = diff(settings, _settings);
          for (var i = 0; i < diffs.length; i++) {
            var d = diffs[i];
            if (d.kind === 'E' && d.path[d.path.length - 1] == 'value') {
              camera.setConfigValue(d.path[d.path.length - 2], d.rhs, function(err) {
                if (err) {
                  return res.send(404, JSON.stringify(err));
                } else {
                  console.log(d.path[d.path.length - 2], 'changed to:', d.rhs);
                }
              });
            }
          }
          ;
        }
        return res.send(200);
      });
    }
  });

  var stream = function() {
    return camera.takePicture({
      preview: true,
      targetPath: '/tmp/stream/foo.XXXXXXX'
    }, function(er, data) {
        if (er) {
          on_error(er);
        } else {
          // success
        }
        // TODO: stop retrying after many errors
        if (is_streaming) {
          setTimeout(stream(), 0);
        }
      });

  };

  app.get('/api/stream/stop', function(req, res) {
    is_streaming = false;
    if (!camera) {
      return res.send(404, 'Camera not connected');
    } else {
      return res.send(200, 'Stream stopped');
    }
  });

  app.get('/api/stream/start', function(req, res) {
    if (!camera) {
      return res.send(404, 'Camera not connected');
    } else if (!is_streaming) {
      is_streaming = true;
      setTimeout(stream(), 0);
      return res.send(200, 'Stream started');
    } else {
      return res.sendStatus(304);
      // return res.send(404, 'Stream already started');
    }
  });


  app.get('/api/preview/:format', function(req, res) {
    if (!camera) {
      return res.send(404, 'Camera not connected');
    } else {
      preview_listeners.push(res);
      if (preview_listeners.length === 1) {
        return camera.takePicture({
          preview: true
        }, function(er, data) {
            var d, listener, tmp, _i, _len, _results;
            logRequests();
            tmp = preview_listeners;
            preview_listeners = new Array();
            d = Date.parse(new Date());
            _results = [];
            for (_i = 0, _len = tmp.length; _i < _len; _i++) {
              listener = tmp[_i];
              if (!er) {
                listener.writeHead(200, {
                  'Content-Type': 'image/' + req.params.format,
                  'Content-Length': data.length
                });
                listener.write(data);
              } else {
                listener.writeHead(500);
              }
              _results.push(listener.end());
            }
            return _results;
          });
      }
    }
  });

  app.listen(process.env.PORT || 1337, "0.0.0.0");

}).call(this);
