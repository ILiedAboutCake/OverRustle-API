// TODO: make this more modular
var redis_host = '172.16.5.254'
var redis_db = 1
var client = require('redis').createClient(6379, redis_host, {})
// TODO: cache

module.exports = function (channel_name, callback) {
  console.log('starting redis for', channel_name)
  client.select(redis_db, function () {
    client.hgetall("channel:"+channel_name, function (e, obj) {
      console.log('did hgetall for', channel_name, 'error:', e, 'result:', obj)
      // return bad things
      // if no channel
      if(!obj || e){
        console.log('nothing in redis SoSad')
        return
      }
      
      callback({
        platform: obj.service,
        channel: obj.stream
      })
    })
  })
}
