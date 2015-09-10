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

  var app = require('express')();
  var server = app.listen(1789);
  var ioServer = require('socket.io')(server);

  var has = require('deep-has');
  var diff = require('deep-diff').diff;
  var RaspiCam = require("raspicam");
  var osc = require('node-osc');
  var client = new osc.Client('127.0.0.1', 3333); 
  
  var config = require('./config/config.json');
  var utils = require('./utils');

  var camera, gphoto, id, logRequests, name, preview_listeners, requests, _ref;
  // TODO: recognize options, -f is for no camera
  var argv = require('minimist')(process.argv.slice(2));
  var lastPicture;
  var is_streaming = false;
  var last_error = 0;
  var cam_id = 0;
  var isRaspicam = config.camera == "raspicam";
  console.log("isRaspicam :" + isRaspicam);
  if (isRaspicam){
    var settings_path = './picamera-settings.json';
    var settings = require(settings_path);
  }
  // https://www.raspberrypi.org/documentation/raspbian/applications/camera.md
  var raspicam_options = {
        mode: "photo",
        output: "/tmp/snap.jpg",
        encoding: "jpg",
        sharpness: 0,
        contrast: 0,
        brightness: 50,
        saturation: 0,
        ISO: 400,
        ev: 0, // Exposure Compensation
        //exposure: 'night', 
        awb: 'fluorescent',
        imxfx: 'none', // image effect
        colfx: '127:127',
        metering: 'average',
        shutter: 1000, // in microsecondes
        drc : 'off', // improve for low light areas
        stats: true,
        awbgains: '1,1', // Sets blue and red gains
        //mode: 7, // conflicts with mode above
        quality: 100,
  };

  var zerorpc = require("zerorpc");

  var client = new zerorpc.Client();
  client.connect("tcp://127.0.0.1:4242");
  client.on("error", function(error) {
        console.error("RPC client error:", error);
  });

  ioServer.on('connection', function(socket){
    console.log('New client connected');
  });

/*  
  setInterval(function(){client.invoke("hello", "World!", function(error, res, more) {
      console.log(res);
      });}
    , 1000);
  */

  process.title = 'zhaoxiangjs';

  gphoto = new GPhoto.GPhoto2();

  requests = {};

  preview_listeners = [];

  camera = void 0;
/*
  var snap_id = 36;
        var camera = new RaspiCam({
          mode: "photo",
          output: "/tmp/snaps/snap-" + snap_id + "-0000.jpg",
          encoding: "jpg"
        });

  camera.on("started", function( err, timestamp ){
    console.log("photo started at " + timestamp );
  });

  camera.on("read", function( err, timestamp, filename ){
    console.log("photo image captured with filename: " + filename );
  });

  camera.on("exit", function( timestamp ){
    console.log("photo child process has exited at " + timestamp );
  });

  camera.start();
*/
  var host = require("os").hostname();
  // TODO: do not use try/catch?
  try {
    // TODO: USE a config file for the hostname
    cam_id = host.match(/voldenuit(.*)/)[1];
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

  //utils.slackit();

  var on_error = function(er) {
    // TODO: socketio error retrieve, to see it in the logs of nuwa
    last_error = er;
    console.error("error code: " + er);
    if (last_error == -7) {
      //console.error("Can't connect to camera, exiting");
      //process.exit(-1);
    }
    else if (last_error == -1) {
      console.error("Exiting because -1 error causes an error of retrieving the last picture at next shoot");
    }
    // To define
    // slackit(er);
    //setTimeout(function(){process.exit(-1);},1000);
  }

  var setSetting = function (param, value){
    //console.log(param, 'set to:', value);

    //client.send('/picamera-osc/settings', param, value);
    client.invoke("set_setting", param, value, function(error, data, more) {
      console.log(data);
    });


    settings.main.children.imgsettings.children[param].value = value

      fs.writeFileSync(settings_path, JSON.stringify(settings, null, 4)/*, function(err) {
          if(err) {
            console.log(err);
          } else {
            //console.log("JSON saved to " + settings_path);
          }
      }*/); 
  }
  var loadSettings = function(){
    if (isRaspicam){
      var settings_ = settings.main.children.imgsettings.children;
      for (var param in settings_){
        setSetting(param, settings_[param].value);
        console.log(param, 'set to:', settings_[param].value);
      }
    }
  }
  loadSettings();

  function guid() {
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
      s4() + '-' + s4() + s4() + s4();
  }

  gphoto.list(function(cameras) {
    console.log(cameras[0]);
    camera = cameras[0];
    // camera = _(cameras).chain().filter(function(camera) {
    //   return camera.model.match(/(Canon|Nikon)/);
    // }).first().value();
    //if (camera)
      //console.log("found " + cameras.length + " cameras");
    if (!camera && !argv.f) {
      //console.log('Exit - no camera found, sorry. :(');
      //process.exit(-1);
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
          //process.exit(-1);
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
        if (!isRaspicam){
          ioServer.emit('countdown', config.countdownDuration);
          setTimeout(function(){
            if (!camera) {
              console.log('No camera');
              on_error(er);
            } else {
              return camera.takePicture({
                download: true,
                // targetPath: config.snapPath+'/snap-' + snap_id + '-' + cam_id + '-XXXXXXX'
              }, function(er, data) {
                  if (er) {
                    console.log('Error in taking photo');
                    on_error(er);
                  } else {
                    var path = config.snapPath+'/snap-'+ guid() +'.jpg';
                    fs.writeFileSync(path, data);
                    lastPicture = path;
                    console.log('lastPicture: ' + lastPicture);
                    socket.emit('photoTaken');
                  }
                });
            }
          }, config.countdownDuration*1000+1000);

        }  
        else {
          raspicam_options.output = '/tmp/snaps/snap-' + snap_id + '-' + cam_id + '-XXXXXXX.jpg';
          //client.send('/picamera-osc/shoot', raspicam_options.output);
          client.invoke("shoot", raspicam_options.output, function(error, data, more) {
            console.log("photo image captured with filename: " + data );
            lastPicture = data;
          });
          /*
          var camera = new RaspiCam(raspicam_options);
          camera.on("read", function( err, timestamp, filename ){
            console.log("photo image captured with filename: " + filename );
            lastPicture = filename;
          });
          camera.start();
          */
        }
      });
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

  var logRequests = function() {
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


  /********
  *
  * Express app part
  *
  * Every API routes here
  *********/

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
    if (!isRaspicam){
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
    }
    else {
      raspicam_options.output = "/tmp/snap.jpg";
      client.invoke("shoot", raspicam_options.output, function(error, data, more) {
        console.log("photo image captured with filename: " + data );
        lastPicture = data;
        return res.send('/api/lastpicture/' + req.params.format);
      });
      //client.send('/picamera-osc/shoot', raspicam_options.output);
      /*
      var camera = new RaspiCam(raspicam_options);
      camera.on("read", function( err, timestamp, filename ){
        console.log("photo image captured with filename: " + filename );
        lastPicture = filename;
        return res.send('/api/lastpicture/' + req.params.format);
      });
      camera.start();
      */
    }
  });

  app.get('/api/shoot/:format', function(req, res) {
    if (!isRaspicam){
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
    }
    else {
      raspicam_options.output = "/tmp/snap.jpg";
      client.invoke("shoot", raspicam_options.output, function(error, data, more) {
        console.log("photo image captured with filename: " + data );
        lastPicture = data;
        return res.send('/api/lastpicture/' + req.params.format);
      });
      /*client.send('/picamera-osc/shoot', raspicam_options.output);
      setTimeout(function(){
        lastPicture = raspicam_options.output;
        return res.send('/api/lastpicture/' + req.params.format);
      }, 2000);
      */
      /*
      var camera = new RaspiCam(raspicam_options);
      camera.on("read", function( err, timestamp, filename ){
        console.log("photo image captured with filename: " + filename );
        lastPicture = filename;
        return res.send('/api/lastpicture/' + req.params.format);
      });
      camera.start();
      */
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
    if (!isRaspicam){
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
    }
    else {
      var setting = has(settings, req.params.name);
      return res.send(_.values(has(setting, 'value')[0])[0]);
    }
  });

  app.put('/api/settings/:name', function(req, res) {
    if (!isRaspicam){
      if (!camera) {
        return res.send(404, 'Camera not connected');
      } else {
        return camera.setConfigValue(req.params.name, req.body.newValue, function(er) {
          if (er) {
            on_error(er);
            return res.send(404, JSON.stringify(er));
          } else {
            return res.sendStatus(200);
          }
        });
      }
    }
    else {
        // TODO: check errors
        // send parameter to camera
        // save setting
        setSetting(req.params.name, req.body.newValue);

        return res.sendStatus(200);
    }
  });

  app.get('/api/settings', function(req, res) {
    if (!isRaspicam){
      if (!camera) {
        return res.send(404, 'Camera not connected');
      } else {
        return camera.getConfig(function(er, settings) {
          return res.send(JSON.stringify(settings));
        });
      }
    }
    else{
          return res.send(JSON.stringify(settings));
    }
  });

  app.put('/api/settings', function(req, res) {
    if (!isRaspicam){
      if (!camera) {
        return res.send(404, 'Camera not connected');
      } else {
        var _settings = JSON.parse(req.body.settings);
        camera.getConfig(function(err, settings) {
          if (err) {
            console.log(err);
          } else {
            var diffs = diff(settings, _settings);
            if (diffs){
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
            }
          }
          return res.sendStatus(200);
        });
      }
    } 
    else {
      var _settings = JSON.parse(req.body.settings);
      console.log(settings);
      var diffs = diff(settings, _settings);
      if (diffs){
        for (var i = 0; i < diffs.length; i++) {
          var d = diffs[i];
          if (d.kind === 'E' && d.path[d.path.length - 1] == 'value') {
            setSetting(d.path[d.path.length - 2], d.rhs);
            console.log(d.path[d.path.length - 2], 'changed to:', d.rhs);
          }
        }
      }
      return res.sendStatus(200);
    }
  });

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
