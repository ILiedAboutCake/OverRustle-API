var dotenv = require('dotenv')
dotenv.load()
var http = require("http")
var request = require('request');
var extend = require('util')._extend;
var apis = {
  DEFAULT_PLACEHOLDER: "http://overrustle.com/img/jigglymonkey.gif",
  // TODO add placeholders for each individual platform
  PLACEHOLDERS: {
    "picarto": "https://www.picarto.tv/img/thumbnail_stream_default.png",
    "mlg": "http://s3.amazonaws.com/s3.majorleaguegaming.com/tv-category-icons/image_16_9s/95/medium/comingsoon.jpg?1390332269",
    "nsfw-chaturbate": "http://i.imgur.com/x7iCWRe.jpg",
    "livestream": "http://thumbnail.api.livestream.com/thumbnail?name=error"
  },
  STREAMING_APIS: {
    // TODO: get stream TITLE
    // TODO: return a promise object, instead of nasty callbacks
    // vods ARE case sensitive
    "twitch-vod": function (api_data, error_callback, callback) {
      return request.get({
        json:true, 
        headers: {
          "Client-ID": process.env['TWITCH_CLIENT_ID']
        },
        uri:"https://api.twitch.tv/kraken/videos/v"+api_data.channel
      }, function (e, r, res) {
        if(e)
          return error_callback(e)
        var json = res
        api_data.live = r.statusCode < 400 && json.hasOwnProperty('status') && json['status'] !== 404
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          // raise an error?
          api_data.image_url = json.preview;
          api_data.viewers = parseInt(json.views, 10);
          api_data.title = json.title;
        }else{
          api_data.image_url = apis.getPlaceholder('twitch-vod')
        }
        callback(api_data)
      })
    },
    twitch: function (api_data, error_callback, callback) {
      return request.get({
        json:true, 
        headers: {
          "Client-ID": process.env['TWITCH_CLIENT_ID']
        },
        uri:"https://api.twitch.tv/kraken/streams/"+api_data.channel
      }, function (e, r, res) {
        if(e)
          return error_callback(e)
        var json = res
        api_data.live = json && json.hasOwnProperty('stream') && json.stream !== null // TODO
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          // raise an error?
          api_data.image_url = json.stream.preview.large;
          api_data.viewers = parseInt(json.stream.viewers, 10);
          api_data.title = json.stream.channel.status;
        }else{
          api_data.image_url = apis.getPlaceholder('twitch')
        }
        callback(api_data)
      })
    },
    hitbox: function (api_data, error_callback, callback) {
      return request.get({json:true, uri:"https://api.hitbox.tv/media/stream/"+api_data.channel}, function (e, r, res) {      
        if(e)
          return error_callback(e)
        var json = res
        api_data.live = json.hasOwnProperty('livestream') && json.livestream[0].media_is_live === "1";
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          // TODO: maybe get their offline image?
          var _stream = json.livestream[0]
          api_data.image_url = "http://edge.sf.hitbox.tv" + _stream.media_thumbnail_large;
          api_data.viewers = parseInt(_stream.media_views, 10);
          api_data.title = _stream.media_status;
        }else{
          api_data.image_url = apis.getPlaceholder('hitbox')
        }
        callback(api_data);
      })
    },
    "hitbox-vod": function (api_data, error_callback, callback) {
      return request.get({json:true, uri:"https://api.hitbox.tv/media/video/"+api_data.channel}, function (e, r, res) {
        if(e)
          return error_callback(e)
        var json = res
        api_data.live = r.statusCode < 400 && json.hasOwnProperty('video')
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          // raise an error?
          var _video = json.video[0];
          api_data.image_url =  "http://edge.sf.hitbox.tv"+_video.media_media_thumbnail_large;
          api_data.viewers = parseInt(_video.media_views, 10);
          api_data.title = _video.media_status;
        }else{
          api_data.image_url = apis.getPlaceholder('hitbox-vod')
        }
        callback(api_data)
      })
    },
    ustream: function (api_data, error_callback, callback) {
      return request.get({json:true, uri:"http://api.ustream.tv/channels/"+api_data.channel+".json"}, function (e, r, res) {
        if(e)
          return error_callback(e)
        var json = res
        api_data.live = r.statusCode != 404 && typeof json.channel !== 'undefined' && json.channel.status === 'live' // todo: get live status from ustream
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          // TODO: maybe get their offline image?
          api_data.image_url = json.channel.thumbnail.live; 
          api_data.viewers = parseInt(json.channel.stats.viewer, 10);
          api_data.title = json.channel.title;
        }else{
          api_data.image_url = apis.getPlaceholder('ustream')
        }
        callback(api_data);
      })
    },

    angelthump: function (api_data, error_callback, callback) {
      return request.get({json:true, uri:"http://angelthump.com/api/"+api_data.channel}, function (e, r, res) {
          if(e)
            return error_callback(e)
          
          var json = res
          api_data.live = r.statusCode != 404 && json.live === true;
          if(api_data.live){
              api_data.image_url = json.thumbnail; 
              api_data.viewers = parseInt(json.viewers, 10);
              api_data.title = json.title;
          }else{
            api_data.image_url = apis.getPlaceholder('angelthump')
          }
          callback(api_data);
        })
    },

    streamup: function (api_data, error_callback, callback) {
      return request.get({json:true, uri:"http://api.streamup.com/v1/channels/"+api_data.channel}, function (e, r, res) {
          if(e)
            return error_callback(e)
          
          var json = res
          api_data.live = r.statusCode != 404 && typeof json.channel !== 'undefined' && json.channel.live === true;
          // console.log("Got response: " + res.statusCode);
          if(api_data.live){
              // TODO: maybe get their offline image?
              api_data.image_url = json.channel.snapshot.cinematic; 
              api_data.viewers = parseInt(json.channel.live_viewers_count, 10);
              api_data.title = json.channel.stream_title;
          }else{
            api_data.image_url = apis.getPlaceholder('streamup')
          }
          callback(api_data);
        })
    },

    azubu: function (api_data, error_callback, callback) {
      // undocumented API's ayy lmao
      return request.get({json:true, uri:"http://www.azubu.tv/api/video/active-stream/"+api_data.channel}, function (e, r, res) {
        if(e)
          return error_callback(e)
        var json = res
        api_data.live = (r.statusCode < 400) && json.total > 0 && json.data[0].user.channel.is_live
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          var _stream = json.data[0].user.channel
          // TODO: maybe get their offline image?
          api_data.image_url = _stream.url_thumbnail;
          api_data.viewers = parseInt(_stream.view_count, 10);
          api_data.title = _stream.title;
        }else{
          api_data.image_url = apis.getPlaceholder('azubu')
        }
        callback(api_data);
      })
    },
    picarto: function (api_data, error_callback, callback) {
      // undocumented API's ayy lmao
      return request.get({uri:"https://www.picarto.tv/channel_img/"+api_data.channel.toLowerCase()+"/thumbnail_stream.png"}, function (e, r, res) {
        if(e)
          return error_callback(e)
        // picarto has no real API. RIP
        // var json = res
        api_data.live = r.statusCode < 400 && r.headers['content-type'].indexOf("image")
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          api_data.image_url = "https://www.picarto.tv/channel_img/"+api_data.channel.toLowerCase()+"/thumbnail_stream.png"          
          // TODO: scrape the page directly if we really want to 
          // implement full support for them
          // "https://www.picarto.tv/live/channel.php?watch="+api_data.channel
          api_data.viewers = 0
          api_data.title = api_data.channel
        }else{
          api_data.image_url = "https://www.picarto.tv/img/offlinestreamer.png"
        }
        callback(api_data);
      })
    },
    // http://xjudge-judyx.api.channel.livestream.com/2.0/widgetinfo.json?cachebuster=1429393784212
    livestream: function (api_data, error_callback, callback) {
      // undocumented API's ayy lmao
      var lvuri = "http://x"+api_data.channel.toLowerCase().replace(/_/gi, '-')+"x.api.channel.livestream.com/2.0/widgetinfo.json?cachebuster="+(new Date().valueOf());
      // console.log("doing livestream", lvuri)
      return http.get(lvuri, function(r) {
        // Continuously update stream with data
        var body = '';
        r.on('data', function(d) {
          body += d;
        });
        r.on('end', function() {
          // Data reception is done, do whatever with it!
          // console.log("Status Code", r.statusCode)
          if (r.statusCode < 400) {
            var json = JSON.parse(body);
            // console.log("Got JSON", json)
          }
          api_data.live = (r.statusCode < 400) && json.hasOwnProperty("channel") && (parseInt(json['channel']['currentViewerCount'], 10) > 0)
          // NOTE: if a stream is playing from replays, it will behave normally on desktop,
          // but they don't provide a m3u8 stream when it's playing from replays
          if(api_data.live){
            // TODO: maybe get their offline image?
            api_data.image_url = "http://thumbnail.api.livestream.com/thumbnail?name="+api_data.channel.toLowerCase(); 
            api_data.viewers = parseInt(json.channel.currentViewerCount, 10);
            api_data.title = json.channel.title;
          }else{
            api_data.image_url = apis.getPlaceholder('livestream')
          }
          callback(api_data);
        });
      }).on('error', function(e) {
        console.log("Host:", mhost)
        console.log("Error: " + e.message);
        console.log(e.stack)
        error_callback(e)
      })
      // request.js does not work here for some reason. 
      // It always returns 404s.
      // I don't know the why it does that.
            // return request.get({json: true, uri: lvuri}, function (e, r, res) {
      //   if(e)
      //     return error_callback(e)
      //   console.log("Got response: " + r.statusCode, r.headers, lvuri);
      //   var json = res;
      //   api_data.live = (r.statusCode < 400) && json.hasOwnProperty("channel") && (parseInt(json['channel']['currentViewerCount'], 10) > 0)
      //   // NOTE: if a stream is playing from replays, it will behave normally on desktop,
      //   // but they don't provide a m3u8 stream when it's playing from replays
      //   if(api_data.live){
      //     // TODO: maybe get their offline image?
      //     api_data.image_url = "http://thumbnail.api.livestream.com/thumbnail?name="+api_data.channel.toLowerCase(); 
      //     api_data.viewers = parseInt(json.channel.currentViewerCount, 10);
      //     api_data.title = json.channel.title;
      //   }else{
      //     api_data.image_url = apis.getPlaceholder('livestream')
      //   }
      //   callback(api_data);
      // })
    },
    mlg: function (api_data, error_callback, callback) {
      // undocumented API's ayy lmao
      // no way to request data for a specific stream
      return request.get({json:true, uri:"http://www.majorleaguegaming.com/api/channels/all.js?fields=id,name,slug,subtitle,stream_name,image_16_9_medium,description"}, function (e, r, res) {
        if(e)
          return error_callback(e)
        var json = res
        api_data.live = r.statusCode < 400 && json.data.items.length > 0
        // console.log("Got response: " + res.statusCode);
        api_data.image_url = apis.getPlaceholder('mlg')
        if (!api_data.live) {
          callback(api_data);
          return
        }
        var _stream = null;
        for (var i = json.data.items.length - 1; i >= 0; i--) {
          if(api_data.channel.toLowerCase() == json.data.items[i]["slug"].toLowerCase()){
            _stream = json.data.items[i]
            break
          }
        }
        if (!_stream) {
          callback(api_data);
          return
        }
        api_data.image_url = _stream.image_16_9_medium
        api_data.title = _stream.subtitle
        request.get({json:true, uri: "http://streamapi.majorleaguegaming.com/service/streams/status/"+_stream.stream_name}, function (e, r, res) {
          if(e)
            return error_callback(e)
          var json = res
          if (r.statusCode >= 400 || !json.data.hasOwnProperty('viewers')) {
            callback(api_data)
            return
          }
          api_data.viewers = parseInt(json.data.viewers, 10)
          // -1 is offline, 1 is live, 2 is replay
          api_data.live = json.data.status == 1
          callback(api_data);
        })
      })
    },
    "nsfw-chaturbate": function (api_data, error_callback, callback) {
      return request.get({uri:"https://chaturbate.com/contest/log_presence/"+api_data.channel.toLowerCase()+"/"}, function (e, r, res) {
        if(e)
          return error_callback(e)
        var json = res
        api_data.live = r.statusCode < 300 && parseInt(json.total_viewers, 10) == 0;
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          api_data.image_url = json.image_url;
          api_data.viewers = parseInt(json.total_viewers, 10);
          // title could be scraped from the page, 
          // not used right now, so we're not using it
          api_data.title = api_data.channel;
        }else{
          api_data.image_url = "https://ssl-cdn.highwebmedia.com/roomimage/offline.jpg"
        }
        callback(api_data);
      })
    },
    // http://live.afreeca.com:8079/api/get_station_status.php?szBjId=han4016
    // thumnail:
    // http://liveimg.afreeca.co.kr:9090/155847008_480x270.gif?1
    // http://live.afreeca.com:8057/api/get_broad_state_list.php
    afreeca: function (api_data, error_callback, callback) {
      return request.post({
        uri:"http://live.afreeca.com:8057/api/get_broad_state_list.php",
        headers: {
          referer: "http://play.afreeca.com/"+api_data.channel.toLowerCase()
        },
        formData: {
          uid: api_data.channel.toLowerCase()
        }
      }, function (e, r, res) {
        if(e)
          return error_callback(e)
        // they base64 encode this endpoint for no reason
        if(res[0] !== "{"){
          res = (new Buffer(res, 'base64')).toString()
        }
        var json = JSON.parse(res)['CHANNEL']['BROAD_INFOS'][0]["list"][0]
        
        api_data.live = r.statusCode < 300 && parseInt(json.nState, 10) == 1;
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          api_data.image_url = json.szThumImg;
          api_data.viewers = parseInt(json.nCurrentView, 10);
          
          api_data.title = json.szBroadTitle;
        }else{
          api_data.image_url = "https://ssl-cdn.highwebmedia.com/roomimage/offline.jpg"
        }
        callback(api_data);
      })
    },
        // a nonexistant video:
    // https://api.dailymotion.com/video/meme?fields=id,title,owner,owner.screenname,owner.url,live_broadcasting,audience,audience_total,media_type,onair,mode,thumbnail_url,views_total
    // a video:
    // https://api.dailymotion.com/video/x26ezrb?fields=id,title,owner,owner.screenname,owner.url,live_broadcasting,audience,audience_total,media_type,onair,mode,thumbnail_url,views_total
    // a live stream:
    // https://api.dailymotion.com/video/x41rb63?fields=id,title,owner,owner.screenname,owner.url,live_broadcasting,audience,audience_total,media_type,onair,mode,thumbnail_url,views_total
    // {
    //   id: "x41rb63",
    //   title: "Taco Supremo",
    //   owner: "x1rcmfy",
    //   owner.screenname: "somefriesmufuggah",
    //   owner.url: "http://www.dailymotion.com/somefriesmufuggah",
    //   live_broadcasting: true,
    //   audience: 2256,
    //   audience_total: 10016,
    //   media_type: "video",
    //   onair: true,
    //   mode: "live",
    //   thumbnail_url: "http://s2.dmcdn.net/T5Eyt.jpg",
    //   views_total: 6572
    // }
    // https://api.dailymotion.com/video/x41rb63?fields=id,title,owner,owner.screenname,owner.url,live_broadcasting,audience,audience_total,media_type,onair,mode,thumbnail_url,views_total
    dailymotion: function (api_data, error_callback, callback) {
            return request.get({json:true, uri:"https://api.dailymotion.com/video/"+api_data.channel+"?fields=id,title,owner,owner.screenname,owner.url,live_broadcasting,audience,audience_total,media_type,onair,mode,thumbnail_url"}, function (e, r, res) {
        if(e)
          return error_callback(e)
        var json = res
        api_data.live = r.statusCode < 400 && typeof json.error === 'undefined'
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          // is this a video, or a live stream?
          if(json.mode === "live" && json.onair){
            api_data.viewers = parseInt(json.audience, 10)
          }else if(json.mode === "vod"){
            api_data.viewers = parseInt(json.views_total, 10)
          }else{
            api_data.viewers = 0
          }
                    api_data.image_url = json.thumbnail_url
          api_data.title = json.title;
        }else{
          api_data.image_url = apis.getPlaceholder('dailymotion')
        }
        callback(api_data);
      })
    },

    // https://gdata.youtube.com/feeds/api/videos/z18NGK1H8n8?v=2&alt=json
    youtube: function (api_data, error_callback, callback) {
      return request.get({json:true, uri:"https://www.googleapis.com/youtube/v3/videos?key="+process.env['GOOGLE_PUBLIC_API_KEY']+"&part=liveStreamingDetails%2Csnippet%2Cstatistics%2Cstatus&id="+api_data.channel}, function (e, r, res) {
        if(e)
          return error_callback(e)
        var json = res
        api_data.live = r.statusCode < 400 && typeof json.items !== 'undefined' && json.items.length > 0
        json = json.items[0]
        // console.log("Got response: " + res.statusCode);
        if(api_data.live){
          // is this a video, or a live stream?
          if(json.snippet.liveBroadcastContent == "live"){
            api_data.viewers = parseInt(json.liveStreamingDetails.concurrentViewers, 10)
          }else if(json.hasOwnProperty("statistics") && json.statistics.hasOwnProperty('viewCount')){
            // technically this check is un-needed
            // but in the past we had problems with 
            // youtube providing incomplete data
            api_data.viewers = parseInt(json.statistics.viewCount, 10)
          }else{
            api_data.viewers = 0
          }
                    // api_data.image_url = snippet.thumbnails
          api_data.image_url = json.snippet.thumbnails.medium.url
          // normally they don't give you maxresdefault
          // api_data.image_url = "http://img.youtube.com/vi/"+api_data.channel+"/maxresdefault.jpg"
                    api_data.title = json.snippet.title;
        }else{
          api_data.image_url = apis.getPlaceholder('youtube')
        }
        callback(api_data);
      })
    }
  },
  getDefaults: function (metadata) {
    var strim_defaults = {
      rustlers: 0, 
      viewers: 0, 
      live: false, 
      image_url: apis.getPlaceholder(metadata.platform)
    }
    // reverse merge
    // b is written into a, and b is returned
    // if we did it the other way, defaults would override real values
    metadata = extend(strim_defaults, metadata)
    return metadata
  },
  getAPI: function (metadata, callback) {
    metadata = apis.getDefaults(metadata);
    if(apis.STREAMING_APIS.hasOwnProperty(metadata.platform)){
      apis.STREAMING_APIS[metadata.platform](metadata, function(e) {
        console.log("ERR: GETing thumbnail for "+metadata.channel+" on "+metadata.platform+" - Got error: " + e.message);
        callback(metadata);
      }, callback);
    }else{
      callback(metadata);
    }
  },
  // todo: placeholders for each platform
  getPlaceholder: function (platform) {
    return apis.PLACEHOLDERS[platform] ? apis.PLACEHOLDERS[platform] : apis.DEFAULT_PLACEHOLDER;
  }  
}
module.exports = apis
