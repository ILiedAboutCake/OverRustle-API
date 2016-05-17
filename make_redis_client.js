var dotenv = require('dotenv')
dotenv.load()

var redis_host = process.env.REDIS_HOST || '127.0.0.1'
var redis_port = process.env.REDIS_PORT || '6379'

var redis = require('redis')

function makeRedisClient (redis_db) {
  var rv = null
  if(process.env.REDISTOGO_URL){
    var rtg   = require("url").parse(process.env.REDISTOGO_URL);
    rv = redis.createClient(rtg.port, rtg.hostname);
    rv.auth(rtg.auth.split(":")[1]);
  }else{
    rv = redis.createClient(redis_port, redis_host);
  }
  rv.select(redis_db); 

  rv.on('connect', function() {
    console.log('Connected to redis#'+redis_db.toString());
  });
  rv.on('error', function (er) {
    console.trace('Channel_fetcher') // [1]
    console.error(er.stack) // [2]
  })

  return rv
}

module.exports = makeRedisClient