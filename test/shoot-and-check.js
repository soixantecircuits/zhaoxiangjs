'use strict'

var spaceBro = require('spacebro-client')
var uniqid = require('uniqid')
var os = require('os')

spaceBro.connect('spacebro.space', 3333, {
  clientName: os.hostname(),
  channelName: 'zhaoxiangjs',
  /*packers: [{ handler: function handler (args) {
      return console.log(args.eventName, '=>', args.data)
  } }],
  unpackers: [{ handler: function handler (args) {
      return console.log(args.eventName, '<=', args.data)
  } }],*/
  verbose: false,
  sendBack: false
})

spaceBro.on('image-saved', function(data){
  console.log(data)
})

setInterval(function(){
  spaceBro.emit('shoot', uniqid())
  console.log('emit shoot')
}, 6000)
