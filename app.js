'use strict'
;(function () {
  var util = require('util')
  var fs = require('fs')
  var path = require('path')
  var _ = require('lodash')

  var GPhoto = require('gphoto2')
  var express = require('express')
  var bodyParser = require('body-parser')
  var mkdirp = require('mkdirp')
  var ip = require('ip')
  var os = require('os')
  var spaceBro = require('spacebro-client')
  var has = require('deep-has')
  var diff = require('deep-diff').diff
  var RaspiCam = require('raspicam')
  var osc = require('node-osc')
  // var client = new osc.Client('127.0.0.1', 3333); 
  var settings = require('./settings/settings.json')
  var utils = require('./utils')
  var exec = require('child_process').exec
  var program = require('commander')

  var Segfault = require('segfault')

  Segfault.registerHandler('/tmp/errors.txt')

  var app, camera, gphoto, id, logRequests, name, preview_listeners, requests, _ref
  // TODO: recognize options, -f is for no camera
  var argv = require('minimist')(process.argv.slice(2))
  var lastPicture
  var is_streaming = false
  var stream_folder = '/tmp/stream/'
  var last_error = 0
  var id_computer = 0
  var id_camera = 0
  var isRaspicam = settings.camera == 'raspicam'

  // get command line arguments
 if (process.argv.length > 1) {
    program
      // TODO: .version('0.0.1')
    .option('-s, --settings <path>', 'Set settings file path')
    .parse(process.argv)
    try {
      if (program.settings){
        var settings = require(program.settings)
      }
    } catch (e) {
      console.warn('Unable to load settings from cli', e)
    }
 }


  var arg = argv._[0]
  if (arg >= 0) {
    id_camera = arg
    console.log('Select camera: ' + id_camera)
  }

  if (isRaspicam) {
    console.log('Started in raspicam mode')
    var settings_path = './picamera-settings.json'
    var settings = require(settings_path)

    // https://www.raspberrypi.org/documentation/raspbian/applications/camera.md
    var raspicam_options = {
      mode: 'photo',
      output: '/tmp/snap.jpg',
      encoding: 'jpg',
      sharpness: 0,
      contrast: 0,
      brightness: 50,
      saturation: 0,
      ISO: 400,
      ev: 0, // Exposure Compensation
      // exposure: 'night', 
      awb: 'fluorescent',
      imxfx: 'none', // image effect
      colfx: '127:127',
      metering: 'average',
      shutter: 1000, // in microsecondes
      drc: 'off', // improve for low light areas
      stats: true,
      awbgains: '1,1', // Sets blue and red gains
      // mode: 7, // conflicts with mode above
      quality: 100,
    }

    var zerorpc = require('zerorpc')

    var client = new zerorpc.Client()
    client.connect('tcp://127.0.0.1:4242')
    client.on('error', function (error) {
      console.error('RPC client error:', error)
    })
  }

  /*
    setInterval(function(){client.invoke("hello", "World!", function(error, res, more) {
        console.log(res)
        });}
      , 1000)
    */

  process.title = 'zhaoxiangjs'


  requests = {}

  preview_listeners = []

  camera = void 0
  /*
    var snap_id = 36
          var camera = new RaspiCam({
            mode: "photo",
            output: "/tmp/snaps/snap-" + snap_id + "-0000.jpg",
            encoding: "jpg"
          })

    camera.on("started", function( err, timestamp ){
      console.log("photo started at " + timestamp )
    })

    camera.on("read", function( err, timestamp, filename ){
      console.log("photo image captured with filename: " + filename )
    })

    camera.on("exit", function( timestamp ){
      console.log("photo child process has exited at " + timestamp )
    })

    camera.start()
  */

  // init numbering
  if (settings.cameraNumber && settings.cameraNumber.indexOf('$hostname') !== -1 ) {

    // get offset  in the form  $hostname+1, $hostname+10
    var offset = 0
    
    var re = /\+(\d+)$/i
    var match = settings.cameraNumber.match(re)

    if (match && match[1]) {
      offset = parseInt(match[1])
    }

    // get offset  in the form  $hostname-1, $hostnamer-10
    re = /-(\d+)$/i
    match = settings.cameraNumber.match(re)

    if (match && match[1]) {
      offset = -parseInt(match[1])
    }


    // get coeff  in the form  $hostname+1, $hostname+10
    var coeff = 1
    
    re = /^(\d+)/i
    match = settings.cameraNumber.match(re)

    if (match && match[1]) {
      coeff = parseInt(match[1])
    }



    // get hostname number in the form myname-01, myname1, ...
    var hostname = os.hostname()
    re = /(\d+)$/i
    match = hostname.match(re)

    if (match && match[1]) {
      settings.cameraNumber = parseInt(match[1])
    } else {
      settings.cameraNumber = 1
    }

    settings.cameraNumber = coeff * settings.cameraNumber + offset
    console.log("camera number: " + settings.cameraNumber)
  }
  if (settings.cameraNumber === 'undefined') {
      settings.cameraNumber = -1
  }
  if (!settings.webport) {
      settings.webport = 1337
  }

  /* old

  var host = os.hostname()
  // TODO: do not use try/catch?
  try {
    // TODO: USE a config file for the hostname
    id_computer = parseInt(host.match(/snapbox(.*)/)[1])
    id_computer += id_camera
    console.log("Camera number sent on spacebro: " + id_computer)
  } catch (err) {
    // console.log(err)
    console.log('Camera number sent on spacebro could not be guessed from the hostname ' + host)
  }
  */

  mkdirp('/tmp/stream', function (err) {
    if (err) console.error(err)
  })
  mkdirp('/tmp/snaps', function (err) {
    if (err) console.error(err)
  })

  // utils.slackit()

  var on_error = function (er) {
    // TODO: socketio error retrieve, to see it in the logs of nuwa
    last_error = er
    console.error('error code: ' + er)
    if (last_error == -7) {
      // console.error("Can't connect to camera, exiting")
      // process.exit(-1)
    }
    else if (last_error == -1) {
      //console.error('Exiting because -1 error causes an error of retrieving the last picture at next shoot')
    }
    //slackit(er)
  // setTimeout(function(){process.exit(-1);},1000)
  }

  var setSetting = function (param, value) {
    // console.log(param, 'set to:', value)

    // client.send('/picamera-osc/settings', param, value)
    client.invoke('set_setting', param, value, function (error, data, more) {
      console.log('setting data: ' + data)
    })

    settings.main.children.imgsettings.children[param].value = value

    fs.writeFileSync(settings_path, JSON.stringify(settings, null, 4) /*, function(err) {
          if(err) {
            console.log(err)
          } else {
            //console.log("JSON saved to " + settings_path)
          }
      }*/)
  }
  var loadSettings = function () {
    if (isRaspicam) {
      var settings_ = settings.main.children.imgsettings.children
      for (var param in settings_) {
        setSetting(param, settings_[param].value)
        console.log(param, 'set to:', settings_[param].value)
      }
    }
  }
  loadSettings()

  var getKernel = function(port, callback) {
    // udevadm info --name /dev/bus/usb/001/009 --attribute-walk | grep KERNEL
    port = port.replace(/,|:/g , '/')
    exec('udevadm info --name /dev/bus/'+ port +  ' --attribute-walk | grep KERNEL', function(error, stdout, stderr) {
      if (error) {
        typeof callback === 'function' && callback(error, null)
        return
      }
      //console.log('udevadm: ', stdout)
      
      var re = /KERNEL=="(\d-\d\.?\d?)"/i
      var match = stdout.match(re)
      //console.log("match: " + match)
      if (match && match[1]) {
        typeof callback === 'function' && callback(null, match[1])
      } else {
        typeof callback === 'function' && callback("KERNELS not found", null)
      }
    })
  }
  
  var connectToCamera = function () {
    gphoto = new GPhoto.GPhoto2()
    gphoto.list(function (cameras) {
      if (cameras.length == 0 && !argv.f) {
        console.log('Exit - no camera found, sorry. :(')
        process.exit(-1)
      }
      cameras.forEach(function (onecamera, index) {
        console.log('Camera found! : ' + onecamera.model)
        console.log('on port: ' + onecamera.port)
        if (settings.kernel) {
          getKernel(onecamera.port, function (err, kernel) {
            if (err) {
              console.log(err);
              return;
            }
            //console.log("kernel: " + kernel)
            if (settings.kernel == kernel) {
              camera = onecamera
              console.log('Selected camera with kernel : ' + settings.kernel)
              console.log('on port: ' + onecamera.port)
            }
          })
        }
        else if (settings.camera_usb_buses) {
          var port = settings.camera_usb_buses[id_camera]
          if (onecamera.port.charAt(6) == port) {
            camera = onecamera
          } else {return;}
        }
        else {
          if (index == id_camera) {
            camera = onecamera
            console.log('Selected camera: ' + id_camera)
            console.log('on port: ' + onecamera.port)
          } else {
            return
          }
        }
        if (is_streaming) {
          setTimeout(stream(), 0)
        }
        /*
        console.log('loading ' + camera.model + ' settings')
        // TODO: uniform error handling
        return camera.getConfig(function (er, settings) {
          if (er) {
            last_error = er
            console.log(er)
            console.error({
              camera_error: er
            })

            utils.restart_usb()
          // process.exit(-1)
          }
          return console.log(settings)
        })
        */
      })
      /*
      if (camera == undefined && !argv.f) {
        console.log('Could not find a camera matching with you settings file')
        process.exit(-1)
      }
      */
    })
  }
  connectToCamera()

  spaceBro.connect('spacebro.space', 3333,{
    clientName: os.hostname(),
    channelName: 'zhaoxiangjs',
    packers: [{ handler: function handler (args) {
        return console.log(args.eventName, '=>', args.data)
    } }],
    unpackers: [{ handler: function handler (args) {
        return console.log(args.eventName, '<=', args.data)
    } }],
    verbose: false,
    sendBack: false
  })

  spaceBro.on('/zhaoxiangjs/stream', function () {
    if (data.camera == id_camera) {
      // is_streaming = data.is_streaming
      is_streaming = true
      console.log('stream: ' + is_streaming)
      if (data.path) {
        stream_folder = data.path
        mkdirp(stream_folder, function (err) {
          if (err) console.error(err)
        })
      }
      if (data.is_streaming == false) {
        stream_folder = '/tmp/stream'
      }

      if (is_streaming) {
        setTimeout(stream(), 0)
      } else {
        camera.takePicture({
          download: true,
          targetPath: '/tmp/snaps/snap-' + '-XXXXXXX'
        }, function (er, data) {
          if (er) {
            on_error(er)
          } else {
            lastPicture = data
          // console.log('lastPicture: ' + lastPicture)
          }
        })
      }
    }
  })
  spaceBro.on('shoot', function (snap_id) {
    if (!isRaspicam) {
      if (!camera) {
        connectToCamera()
        on_error(er)
      } else {
        var filename = 'snap-' + snap_id + '-' + settings.cameraNumber + '-XXXXXXX'
        return camera.takePicture({
          download: true,
          targetPath: path.join('/tmp/snaps/' + filename)
        }, function (er, data) {
          if (er) {
            on_error(er)
          } else {
            lastPicture = data
            console.log('emit')
            spaceBro.emit('image-saved', {
              // path to download file
              src: 'http://' + ip.address() + ':' + settings.webport + '/' + path.basename(data) + '.jpg',
              // number of the camera in the 3-6-flip
              number: settings.cameraNumber,
              // unique id of the shooting
              album_name: snap_id
            })

          // console.log('lastPicture: ' + lastPicture)
          }
        })
      }
    } else {
      raspicam_options.output = '/tmp/snaps/snap-' + snap_id + '-' + settings.cameraNumber + '-XXXXXXX.jpg'
      // client.send('/picamera-osc/shoot', raspicam_options.output)
      client.invoke('shoot', raspicam_options.output, function (error, data, more) {
        console.log('photo image captured with filename: ' + data)
        lastPicture = data
      })
    /*
    var camera = new RaspiCam(raspicam_options)
    camera.on("read", function( err, timestamp, filename ){
      console.log("photo image captured with filename: " + filename )
      lastPicture = filename
    })
    camera.start()
    */
    }
  })

  app = express()

  app.use(function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept')
    next()
  })

  app.use(express['static'](__dirname + '/public'))
  app.use(express['static']('/tmp/snaps'))

  // app.use(express.bodyParser())
  app.use(bodyParser.urlencoded({
    extended: false
  }))
  app.use(bodyParser.json())

  app.engine('.html', require('jade').__express)

  app.get('/', function (req, res) {
    return res.render('index.html')
  })

  app.get(/(.*)\.jpg$/, function(req,res){
    //res.sendFile(req.params[0], {root: '/tmp/snaps'});
    fs.readFile(path.join('/tmp/snaps', req.params[0]), function (er, data) {
      if (er) {
        return res.send(404, er)
      } else {
        res.header('Content-Type', 'image/jpg')
        return res.send(data)
      }
    })
  })

  logRequests = function () {
    var d, fps
    d = Date.parse(new Date()) / 1000
    if (requests[d] > 0) {
      return requests[d]++
    } else {
      fps = requests[d - 1]
      requests = {}
      requests[d] = 1
      if (fps) {
        return console.log(fps + ' fps')
      }
    }
  }

  app.get('/api/status', function (req, res) {
    var model = 'Not connected'
    if (camera)
      model = camera.model
    var camera_stuck = false
    if (last_error == -7)
      camera_stuck = true
    var status = {
      camera: model,
      isStreaming: is_streaming,
      last_error: last_error,
      camera_stuck: camera_stuck
    }
    res.status(200).json(status)
  })

  app.get('/api/shoot/', function (req, res) {
    if (!isRaspicam) {
      if (!camera) {
        connectToCamera()
        return res.send(404, 'Camera not connected')
      } else {
        return camera.takePicture({
          targetPath: '/tmp/foo.XXXXXXX'
        }, function (er, data) {
          if (er) {
            on_error(er)
            return res.send(404, er)
          } else {
            lastPicture = data
            // console.log('lastPicture: ' + lastPicture)
            return res.send(lastPicture)
          }
        })
      }
    } else {
      raspicam_options.output = '/tmp/snap.jpg'
      client.invoke('shoot', raspicam_options.output, function (error, data, more) {
        console.log('photo image captured with filename: ' + data)
        lastPicture = data
        return res.send('/api/lastpicture/' + req.params.format)
      })
    // client.send('/picamera-osc/shoot', raspicam_options.output)
    /*
    var camera = new RaspiCam(raspicam_options)
    camera.on("read", function( err, timestamp, filename ){
      console.log("photo image captured with filename: " + filename )
      lastPicture = filename
      return res.send('/api/lastpicture/' + req.params.format)
    })
    camera.start()
    */
    }
  })

  app.get('/api/shoot/:format', function (req, res) {
    if (!isRaspicam) {
      if (!camera) {
        connectToCamera()
        return res.send(404, 'Camera not connected')
      } else {
        return camera.takePicture({
          targetPath: '/tmp/foo.XXXXXXX'
        }, function (er, data) {
          if (er) {
            on_error(er)
            return res.send(404, er)
          } else {
            lastPicture = data
            return res.send('/api/lastpicture/' + req.params.format)
          }
        })
      }
    } else {
      raspicam_options.output = '/tmp/snap.jpg'
      client.invoke('shoot', raspicam_options.output, function (error, data, more) {
        console.log('photo image captured with filename: ' + data)
        lastPicture = data
        return res.send('/api/lastpicture/' + req.params.format)
      })
    /*client.send('/picamera-osc/shoot', raspicam_options.output)
    setTimeout(function(){
      lastPicture = raspicam_options.output
      return res.send('/api/lastpicture/' + req.params.format)
    }, 2000)
    */
    /*
    var camera = new RaspiCam(raspicam_options)
    camera.on("read", function( err, timestamp, filename ){
      console.log("photo image captured with filename: " + filename )
      lastPicture = filename
      return res.send('/api/lastpicture/' + req.params.format)
    })
    camera.start()
    */
    }
  })

  app.get('/api/lastpicture/', function (req, res) {
    var format = (req.params.format != null) ? req.params.format : 'jpeg'
    res.header('Content-Type', 'text/plain')
    console.log('lastPicture: ' + lastPicture)
    return res.send(lastPicture)
  })

  app.get('/api/lastpicture/:format', function (req, res) {
    fs.readFile(lastPicture, function (er, data) {
      if (er) {
        return res.send(404, er)
      } else {
        res.header('Content-Type', 'image/' + req.params.format)
        return res.send(data)
      }
    })
  })

  app.get('/api/settings/:name', function (req, res) {
    if (!isRaspicam) {
      if (!camera) {
        connectToCamera()
        return res.send(404, 'Camera not connected')
      } else {
        camera.getConfig(function (er, settings) {
          if (er) {
            on_error(er)
            return res.send(404, JSON.stringify(er))
          } else {
            var setting = has(settings, req.params.name)
            return res.send(_.values(has(setting, 'value')[0])[0])
          }
        })
      }
    } else {
      var setting = has(settings, req.params.name)
      return res.send(_.values(has(setting, 'value')[0])[0])
    }
  })

  app.put('/api/settings/:name', function (req, res) {
    if (!isRaspicam) {
      if (!camera) {
        connectToCamera()
        return res.send(404, 'Camera not connected')
      } else {
        return camera.setConfigValue(req.params.name, req.body.newValue, function (er) {
          if (er) {
            on_error(er)
            return res.send(404, JSON.stringify(er))
          } else {
            return res.sendStatus(200)
          }
        })
      }
    } else {
      // TODO: check errors
      // send parameter to camera
      // save setting
      setSetting(req.params.name, req.body.newValue)

      return res.sendStatus(200)
    }
  })

  app.get('/api/settings', function (req, res) {
    if (!isRaspicam) {
      if (!camera) {
        connectToCamera()
        return res.send(404, 'Camera not connected')
      } else {
        return camera.getConfig(function (er, settings) {
          return res.send(JSON.stringify(settings))
        })
      }
    } else {
      return res.send(JSON.stringify(settings))
    }
  })

  app.put('/api/settings', function (req, res) {
    if (!isRaspicam) {
      if (!camera) {
        connectToCamera()
        return res.send(404, 'Camera not connected')
      } else {
        var _settings = JSON.parse(req.body.settings)
        camera.getConfig(function (err, settings) {
          if (err) {
            console.log(err)
          } else {
            var diffs = diff(settings, _settings)
            if (diffs) {
              for (var i = 0; i < diffs.length; i++) {
                var d = diffs[i]
                if (d.kind === 'E' && d.path[d.path.length - 1] == 'value') {
                  camera.setConfigValue(d.path[d.path.length - 2], d.rhs, function (err) {
                    if (err) {
                      return res.send(404, JSON.stringify(err))
                    } else {
                      console.log(d.path[d.path.length - 2], 'changed to:', d.rhs)
                    }
                  })
                }
              }
            }
          }
          return res.sendStatus(200)
        })
      }
    } else {
      var _settings = JSON.parse(req.body.settings)
      console.log(settings)
      var diffs = diff(settings, _settings)
      if (diffs) {
        for (var i = 0; i < diffs.length; i++) {
          var d = diffs[i]
          if (d.kind === 'E' && d.path[d.path.length - 1] == 'value') {
            setSetting(d.path[d.path.length - 2], d.rhs)
            console.log(d.path[d.path.length - 2], 'changed to:', d.rhs)
          }
        }
      }
      return res.sendStatus(200)
    }
  })

  var index_stream = 0

  var zeroFill = function (number, width) {
    width -= number.toString().length
    if (width > 0) {
      return new Array(width + (/\./.test(number) ? 2 : 1)).join('0') + number
    }
    return number + '' // always return a string
  }

  var stream = function () {
    index_stream++
    return camera.takePicture({
      preview: true,
      targetPath: path.join(stream_folder, 'foo.' + zeroFill(index_stream, 7) + '.XXXXXXX')
    // targetPath: '/tmp/stream/foo.XXXXXXX'
    }, function (er, data) {
      if (er) {
        on_error(er)
      } else {
        // success
      }
      // TODO: stop retrying after many errors
      if (is_streaming) {
        setTimeout(stream(), 0)
      }
    })
  }

  app.get('/api/stream/stop', function (req, res) {
    is_streaming = false
    if (!camera) {
        connectToCamera()
      return res.send(404, 'Camera not connected')
    } else {
      return res.send(200, 'Stream stopped')
    }
  })

  app.get('/api/stream/start', function (req, res) {
    if (!camera) {
        connectToCamera()
      return res.send(404, 'Camera not connected')
    } else if (!is_streaming) {
      is_streaming = true
      setTimeout(stream(), 0)
      return res.send(200, 'Stream started')
    } else {
      return res.sendStatus(304)
    // return res.send(404, 'Stream already started')
    }
  })

  app.get('/api/preview/:format', function (req, res) {
    if (!camera) {
        connectToCamera()
      return res.send(404, 'Camera not connected')
    } else {
      preview_listeners.push(res)
      if (preview_listeners.length === 1) {
        return camera.takePicture({
          preview: true
        }, function (er, data) {
          var d, listener, tmp, _i, _len, _results
          logRequests()
          tmp = preview_listeners
          preview_listeners = []
          d = Date.parse(new Date())
          _results = []
          for (_i = 0, _len = tmp.length; _i < _len; _i++) {
            listener = tmp[_i]
            if (!er) {
              listener.writeHead(200, {
                'Content-Type': 'image/' + req.params.format,
                'Content-Length': data.length
              })
              listener.write(data)
            } else {
              listener.writeHead(500)
            }
            _results.push(listener.end())
          }
          return _results
        })
      }
    }
  })

  process.on('uncaughtException', function (er) {
    console.error('warning ' + er.stack)
  })

  app.listen(process.env.PORT || settings.webport, ip.address())
  console.log('Serving on http://'+ip.address()+':'+settings.webport)
}).call(this)
