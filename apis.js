var request = require('request');
var extend = require('util')._extend;

var apis = {
  DEFAULT_PLACEHOLDER: "http://overrustle.com/img/jigglymonkey.gif",
  // TODO add placeholders for each individual platform
  PLACEHOLDERS: {

  },
  STREAMING_APIS: {
    // TODO: get stream TITLE
    // TODO: return a promise object, instead of nasty callbacks
    twitch: function (api_data, error_callback, callback) {
      return request.get({json:true, uri:"https://api.twitch.tv/kraken/streams/"+api_data.channel}, function (e, r, res) {
        if(e)
          return error_callback(e)
        var json = res
        api_data.live = json && json.hasOwnProperty('stream') && json.stream !== null // TODO
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          // raise an error?
          api_data.image_url = json.stream.preview.large;
          api_data.viewers = parseInt(json.stream.viewers, 10);
        }else{
          api_data.image_url = apis.getPlaceholder('twitch')
        }
        callback(api_data)
      })
    },
    hitbox: function (api_data, error_callback, callback) {
      return request.get({json:true, uri:"http://api.hitbox.tv/media/stream/"+api_data.channel}, function (e, r, res) {      
        if(e)
          return error_callback(e)
        var json = res
        api_data.live = json.hasOwnProperty('livestream') && json.livestream[0].media_is_live === "1";
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          // TODO: maybe get their offline image?
          api_data.image_url = "http://edge.sf.hitbox.tv" + json.livestream[0].media_thumbnail_large;
          api_data.viewers = parseInt(json.livestream[0].media_views, 10);
        }else{
          api_data.image_url = apis.getPlaceholder('hitbox')
        }
        callback(api_data);
      })
    },
    ustream: function (api_data, error_callback, callback) {
      return request.get({json:true, uri:"http://api.ustream.tv/channels/"+api_data.channel+".json"}, function (e, r, res) {
        if(e)
          return error_callback(e)
        var json = res
        api_data.live = r.statusCode != 404 && json.channel.status === 'live' // todo: get live status from ustream
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          // TODO: maybe get their offline image?
          api_data.image_url = json.channel.thumbnail.live; 
          api_data.viewers = parseInt(json.channel.stats.viewer, 10);
        }else{
          api_data.image_url = apis.getPlaceholder('ustream')
        }
        callback(api_data);
      })
    },
    youtube: function (api_data, error_callback, callback) {
      api_data.live = true
      // TODO: get the numbers from youtube if we end up
      // actually using the API's viewer counts
      api_data.viewers = 0
      api_data.image_url = "http://img.youtube.com/vi/"+api_data.channel+"/maxresdefault.jpg"

      callback(api_data)
    }
  },
  getAPI: function (metadata, callback) {
    if(apis.STREAMING_APIS.hasOwnProperty(metadata.platform)){
      apis.STREAMING_APIS[metadata.platform](metadata, function(e) {
        console.log("ERR: GETing thumbnail for "+metadata.channel+" on "+metadata.platform+" - Got error: " + e.message);
        extend({viewers: 0, live: false, image_url: apis.getPlaceholder(metadata.platform)}, metadata)
        callback(metadata);
      }, callback);
    }else{
      extend({viewers: 0, live: true, image_url: apis.getPlaceholder(metadata.platform)}, metadata)
      callback(metadata);
    }
  },
  // todo: placeholders for each platform
  getPlaceholder: function (platform) {
    return apis.PLACEHOLDERS[platform] ? apis.PLACEHOLDERS[platform] : apis.DEFAULT_PLACEHOLDER;
  }  
}

module.exports = apis
