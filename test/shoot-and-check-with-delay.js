'use strict'

var spaceBro = require('spacebro-client')
var uniqid = require('uniqid')
var os = require('os')
var moment = require('moment')

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
  var date = moment()
  date = date.add(2000 - date.milliseconds())
  spaceBro.emit('shoot', {albumId:uniqid(), frameDelay: 0, atTime:date.format('YYYY-MM-DDTHH:mm:ss.SSSZ') } )
  console.log('emit shoot')
}, 300)
setInterval(function(){
  var date = moment()
  date = date.add(2000 - date.milliseconds())
  spaceBro.emit('shoot', {albumId:uniqid(), frameDelay: 0, atTime:date.format('YYYY-MM-DDTHH:mm:ss.SSSZ') } )
  console.log('emit shoot')
}, 5000)
