var redis_client = require('./make_redis_client')(4)
var Promise = require('bluebird')

// TODO DECIDE ON A BETTER PRIMARY KEY
// this presumes that platform+channel is unique
// var PRIMARYKEY = stream.platform+'/'+stream.channel

var NUMBER_FIELDS = [
  'rustlers',
  'viewers',
  'expire_at'
]

var BOOLEAN_FIELDS = [
  'featured',
  'live'
]

var featureMod = {
  rawGet: function(key){
    return new Promise(function (resolve, reject){
      redis_client.hgetall(key, function (err, returned){
        if (err) {
          reject(err)
        }
        // convert fields to proper types
        NUMBER_FIELDS.forEach(function (n){
          if (returned.hasOwnProperty(n)) {
            returned[n] = parseInt(returned[n], 10)
          }
        })
        BOOLEAN_FIELDS.forEach(function (n){
          if (returned.hasOwnProperty(n)) {
            returned[n] = (returned[n] == 'true' || returned[n] == true)
          }
        })

        resolve(returned)
      })
    })
  },
  get: function(name){
    return featureMod.rawGet('stream:'+name)
  },
  set: function(name, stream){
    return new Promise(function (resolve, reject){
      redis_client.hmset('stream:'+name, stream, function (err, result){
        if(err){
          return reject(err)
        }
        resolve(result)
      })
    })
  },
  featureByStream: function(stream){
    return featureMod.featureByName(stream.platform+'/'+stream.channel)
  },
  featureByName: function(name){
    return featureMod.get(name).then(function (stream){
      stream.featured = true
      return featureMod.set(name, stream)
    })
  },
  upsert: function(primary_key, stream){
    // TODO DECIDE ON A BETTER PRIMARY KEY
    // this presumes that platform+channel is unique
    // var PRIMARYKEY = stream.platform+'/'+stream.channel

    return featureMod.set(primary_key, stream).then(function (stream){
      return featureMod.get(primary_key)
    })
  },
  all: function(){
    // console.log('getting all')
    var streams = []
    return new Promise(function (resolve, reject){
      redis_client.keys('stream:*', function (err, keys) {
        if (err) reject(err);
        // console.log('all keys', keys, typeof keys)
        resolve(keys)
      })
    }).then(function (keys) {
      // console.log('all keys', keys, typeof keys)
      return Promise.all(keys.map(function (key) {
        // console.log('inside Primse.all keys.map', key)
        return new Promise(function (resolve, reject) {
          featureMod.rawGet(key).then(function (res, derp){
            console.log(res, derp)
            streams.push(res);
            resolve();            
          })
          // redis_client.hgetall(key, function (err, res) {
          //   if (err) reject(err);
          // })
        });
      }))
    }).then(function(){
      // console.log('final THEN for .all. Streams is', streams)
      return new Promise(function (resolve, reject){
        resolve(streams)      
      })
    })
  }
}

module.exports = featureMod