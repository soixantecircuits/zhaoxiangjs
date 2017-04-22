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
  var moment = require('moment')
  var NanoTimer = require('nanotimer')

  var Segfault = require('segfault')

  Segfault.registerHandler('/tmp/errors.txt')

  var app, camera, gphoto, id, logRequests, name, preview_listeners, requests, _ref
  // TODO: recognize options, -f is for no camera
  var argv = require('minimist')(process.argv.slice(2))
  var lastPicture
  var is_streaming = true
  var stream_folder = '/tmp/stream/'
  var preview_folder = '/tmp/preview/'
  var last_error = 0
  var id_computer = 0
  var id_camera = 0
  var isRaspicam = settings.camera == 'raspicam'
  var host = ip.address() 
  //var host = os.hostname() + '.local'

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
  if (settings.cameraNumber === 'undefined' || settings.cameraNumber == null) {
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

  mkdirp(stream_folder, function (err) {
    if (err) console.error(err)
  })
  mkdirp('/tmp/snaps', function (err) {
    if (err) console.error(err)
  })
  mkdirp(preview_folder, function (err) {
    if (err) console.error(err)
  })

  // utils.slackit()

  var on_error = function (er) {
    if (!er) er = 0
    if (last_error != er) {
      // TODO: socketio error retrieve, to see it in the logs of nuwa
      last_error = er
      sendStatus()
      console.log('error code: ' + er)
      if (last_error == -7) {
        // console.error("Can't connect to camera, exiting")
        // process.exit(-1)
      }
      else if (last_error == -1) {
        //console.error('Exiting because -1 error causes an error of retrieving the last picture at next shoot')
        //process.exit(-1)
        setTimeout(function(){process.exit(-1);}, 300)
      }
      //slackit(er)
      // setTimeout(function(){process.exit(-1);},1000)
    }
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
              setTimeout(function() { sendStatus()}, 300)
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
            setTimeout(function() { sendStatus()}, 300)
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

  //spaceBro.connect('10.60.60.139', 8888,{
  spaceBro.connect('10.0.0.18', 8888,{
    clientName: os.hostname(),
    channelName: 'zhaoxiangjs',
    /*
    packers: [{ handler: function handler (args) {
        return console.log(args.eventName, '=>', args.data)
    } }],
    unpackers: [{ handler: function handler (args) {
        return console.log(args.eventName, '<=', args.data)
    } }],
    */
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
          on_error(er)
          if (er) {
          } else {
            lastPicture = data
          // console.log('lastPicture: ' + lastPicture)
          }
        })
      }
    }
  })

  var checkIfRawPicture = function(callback) {
    camera.getConfig(function (er, settings) {
      on_error(er)
      if (er) {
          typeof callback === 'function' && callback(er, false)
      } else {
        var setting = has(settings, 'imageformat')
        if (_.values(has(setting, 'value')[0])[0] == 'RAW'){
          typeof callback === 'function' && callback(er, true)
        } else {
          typeof callback === 'function' && callback(er, false)
        }
      }
    })
  }

  var shoot = function(data, callback) {
    var snap_id = data.albumId
    var datelog = moment()
    console.log('shoot at ' + datelog.format('YYYY-MM-DDTHH:mm:ss.SSSZ'))
    var date = moment(data.atTime)
    var late = datelog - date
    if (!isRaspicam) {
      if (!camera) {
        connectToCamera()
        typeof callback === 'function' && callback('no camera', null)
      } else {
        var cameraNumber = settings.cameraNumber
        if (cameraNumber < 10) cameraNumber = '0' + cameraNumber
        var filename = 'snap-' + snap_id + '-' + cameraNumber + '-' + late + '-XXXXXXX'
        return camera.takePicture({
          download: true,
          targetPath: path.join('/tmp/snaps/' + filename)
        }, function (er, filepath) {
          on_error(er)
          if (er) {
            typeof callback === 'function' && callback(er, null)
          } else {
            checkIfRawPicture( function(er, isRaw) {
              var ext = '.jpg'
              if (isRaw) {
                ext = '.cr2'
                console.log('shooting in RAW')
              } else {
                lastPicture = filepath
              }
              console.log('emit')
              data.src = 'http://' + host + ':' + settings.webport + '/' + path.basename(filepath) + ext
              data.number = settings.cameraNumber
              data.raw = isRaw
              data.late = late

              spaceBro.emit('image-saved', data)
              typeof callback === 'function' && callback(null, data)
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

  }
  var shootOnTime = function (data, callback) {
      if (data.atTime) {
        var date = moment(data.atTime)
        if (date < moment()) {
          shoot(data)
        } else {
          var timer = new NanoTimer();
          var delay = (date - moment()) + (settings.cameraNumber - 1) * data.frameDelay
          timer.setTimeout(function() {
            shoot(data, callback)
          }, [timer], delay + 'm')
        }
      }
      else if (data.frameDelay && data.frameDelay > 0) {
        setTimeout(function(){shoot(data.albumId, callback)}, (settings.cameraNumber - 1) * data.frameDelay)
      } else if (data.frameDelay == 0) {
        shoot(data, callback)
      } else if (data.albumId) {
        shoot(data, callback)
      } else {
        // legacy
        shoot({albumId: data}, callback)
      }
  }

  spaceBro.on('connect', function (data) {
    sendStatus()
  })

  spaceBro.on('getStatus', function (data) {
    sendStatus()
  })

  spaceBro.on('shoot', function (data) {
    if (data.preview) {
      console.log ("shoot a preview")
      getImageFormat(function(er, imageformat) {
        selectImageFormat('preview', function(er) {
          shootOnTime(data, function (er) {
            selectImageFormat(imageformat, function(er) { if(er) console.log(er)})
          })
        })
      })
    } else {
      shootOnTime(data)
    }
  })

  var selectImageFormat = function(format, callback) {
    var value = undefined
    if (format) {
      if (format == 'raw' || format == 'RAW') {
        value = 'RAW' 
      } else if (format == 'preview' || format == 'PREVIEW') {
        value = 'Smaller JPEG (S2)' 
      } else {
        value = format
      }
    }
    if (value) {
      return camera.setConfigValue('imageformat', value, function (er) {
        on_error(er)
        typeof callback === 'function' && callback(er)
      })
    } else {
        typeof callback === 'function' && callback('No format specified or invalid value')
    }
  }

  var getImageFormat = function(callback) {
        camera.getConfig(function (er, settings) {
          on_error(er)
          if (er) {
            typeof callback === 'function' && callback(er)
          } else {
            var setting = has(settings, 'imageformat')
            var data = _.values(has(setting, 'value')[0])[0]
            typeof callback === 'function' && callback(null, data)
          }
        })
  }

  var getStatus = function() {
    var model = 'Not connected'
    if (camera)
      model = camera.model
    var camera_stuck = false
    if (last_error == -7)
      camera_stuck = true
    var data = {
      number: settings.cameraNumber,
      camera: model,
      isStreaming: is_streaming,
      last_error: last_error,
      camera_stuck: camera_stuck,
      api: 'http://'+host+':'+settings.webport
    }
    return data
  }

  var sendStatus = function() {
    spaceBro.emit('status', getStatus())
  }

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

  app.get(/(.*)\.(jpg|cr2)$/, function(req,res){
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
    res.status(200).json(getStatus())
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
          on_error(er)
          if (er) {
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
          on_error(er)
          if (er) {
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
    if (lastPicture) {
      fs.readFile(lastPicture, function (er, data) {
        if (er) {
          return res.send(404, er)
        } else {
          res.header('Content-Type', 'image/' + req.params.format)
          return res.send(data)
        }
      })
    } else {
        return camera.takePicture({
              //preview: true,
              targetPath: path.join(preview_folder, 'foo.' + zeroFill(index_stream, 7) + '.XXXXXXX')
            }, function (er, path) {
              on_error(er)
              if (!er && path != undefined) {
                lastPicture = path
                fs.readFile(path, function (er, data) {
                    if (!er) {
                      res.header('Content-Type', 'image/' + req.params.format)
                      return res.send(data)
                    } else {
                      return res.writeHead(500)
                    }
                })
              } else {
                return res.sendStatus(503)
              }
        })
    }
  })

  app.get('/api/settings/:name', function (req, res) {
    if (!isRaspicam) {
      if (!camera) {
        connectToCamera()
        return res.send(404, 'Camera not connected')
      } else {
        camera.getConfig(function (er, settings) {
          on_error(er)
          if (er) {
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
          on_error(er)
          if (er) {
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
        console.log('received new json settings')
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
          console.log('settings written')
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
      on_error(er)
      if (er) {
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
        getImageFormat(function(er, imageformat) {
          selectImageFormat('preview', function(er) {
            index_stream++
            return camera.takePicture({
              //preview: true,
              targetPath: path.join(preview_folder, 'foo.' + zeroFill(index_stream, 7) + '.XXXXXXX')
            }, function (er, path) {
              on_error(er)
              selectImageFormat(imageformat, function(er) { if(er) console.log(er)})
              if (!er && path != undefined) {
                console.log("read image", path)
                lastPicture = path
                fs.readFile(path, function (er, data) {
                    if (!er) {
                      console.log("reply")
                      res.header('Content-Type', 'image/' + req.params.format)
                      return res.send(data)
                      /*
                      res.writeHead(200, {
                        'Content-Type': 'image/' + req.params.format,
                        'Content-Length': data.length
                      })
                      console.log("reply")
                      return res.send(data)
                      */
                    } else {
                      return res.writeHead(500)
                    }
                })
              } else {
                console.log("preview error", path)
                return res.sendStatus(503)
              }
            })
          })
        })
    }
  })

/*
// preview with many listeners, as seen in node-gphoto2 example
  app.get('/api/preview/:format', function (req, res) {
    if (!camera) {
        connectToCamera()
      return res.send(404, 'Camera not connected')
    } else {
      preview_listeners.push(res)
      if (preview_listeners.length === 1) {
        index_stream++
        return camera.takePicture({
          preview: true,
          targetPath: path.join(preview_folder, 'foo.' + zeroFill(index_stream, 7) + '.XXXXXXX')
        }, function (er, path) {
          fs.readFile(path, function (er, data) {
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
          })
      }
    }
  })
*/
  process.on('uncaughtException', function (er) {
    console.error('warning ' + er.stack)
  })

  app.listen(process.env.PORT || settings.webport)
  console.log('Serving on http://'+host+':'+settings.webport)
}).call(this)
