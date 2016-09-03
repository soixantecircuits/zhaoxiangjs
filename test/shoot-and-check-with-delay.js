'use strict'

var spaceBro = require('spacebro-client')
var uniqid = require('uniqid')
var os = require('os')

//spaceBro.connect('spacebro.space', 3333, {
spaceBro.connect('yoga.local', 8888, {
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

setTimeout(function(){
  spaceBro.emit('shoot', {albumId:uniqid(), frameDelay: 0} )
  console.log('emit shoot')
}, 300)
setInterval(function(){
  spaceBro.emit('shoot', {albumId:uniqid(), frameDelay: 200} )
  console.log('emit shoot')
}, 20000)
