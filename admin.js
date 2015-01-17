var dotenv = require('dotenv')
dotenv.load()

var shortcuts = require('./shortcuts.js')
var extend = require('util')._extend;
var API_SECRET = process.env.API_SECRET || Math.random().toString()
console.log(API_SECRET.length, "character long secret")

var admin = {
  'app': null,
  init: function (app) {
    admin.app = app
    // specify API secret within headers
    app.get('/admin/:code', admin.httpHandle('administrate'))
    app.post('/admin', admin.httpHandle('administrate'))
    
    app.post('/admin/reload', admin.httpHandle('reload'))
    app.get('/admin/reload', admin.httpHandle('reload'))
    app.get('/admin/reload/:who', admin.httpHandle('reload'))

    app.post('/admin/redirect', admin.httpHandle('redirect'))
    app.post('/admin/punt', admin.httpHandle('redirect'))
    app.get('/admin/redirect/:to', admin.httpHandle('redirect'))
    app.get('/admin/redirect/:who/:to*', admin.httpHandle('redirect'))
    app.get('/admin/punt/:to', admin.httpHandle('redirect'))
    app.get('/admin/punt/:who/:to*', admin.httpHandle('redirect'))

    app.post('/admin/notify', admin.httpHandle('notify'))
    app.get('/admin/notify/:message', admin.httpHandle('notify'))
    app.get('/admin/notify/:who/:message*', admin.httpHandle('notify'))

    app.post('/admin/feature', admin.httpHandle('feature'))
    app.get('/admin/feature/:who*', admin.httpHandle('feature'))
    app.get('/admin/feature/:to/:who*', admin.httpHandle('feature'))
  },
  handle: function(which, data){
    var success = admin.validate({
      key: data['key']
    })

    success = success ? admin[which](data) : success

    console.log((success ? 'good' : 'bad') + ' dankmemes')
    return success
  },
  normalize: function (req, res) {
    extend(req.params, req.query)
    extend(req.params, req.body)
    if (!req.params.hasOwnProperty("key")) {
      req.params['key'] = req.header('API_SECRET')
    }
    console.log(req.params)
  },
  httpHandle: function (arg) {
    return function (req, res){
      admin.normalize(req, res)
      var good_memes = admin.handle(arg, req.params)
      res.sendStatus(good_memes ? 200 : 403)
      res.end()
    }
  },
  validate: function(data){
    if(data.hasOwnProperty('key') && data['key'] === API_SECRET){
      data['key'] = "";
      return true
    }
    return false
  },
  //
  // Assume everything is generally valid at this point
  //
  /////////////////////////////////////////////////////
  // 
  // CONSIDER: moving all these functions client side
  // and just calling them from remote code
  // 
  administrate: function(data) {
    // data should have: {key: api_secret, code: js_string_to_eval}
    console.log('got admin dankmemes')
    admin.app.browsers.emit('admin', data)
    admin.app.watchers.emit('admin', data)
    return true
  },
  notify: function (data) {
    if (!data.hasOwnProperty('message')) {
      return false
    }
    var has_who = data.hasOwnProperty('who') && data['who'] && data['who'] !== 'all'

    data['code'] = "Notification.requestPermission(function(hasP){;"
    if (has_who) {
      data['code'] += "if (window.location.toString().toLowerCase().indexOf('"+
        data['who']+"')!==-1) {;"
    }
    data['code'] += "new Notification('"+data['message']+"');"
    if (has_who) {
      data['code'] += "};"
    }
    data['code'] += "});"

    admin.app.browsers.emit('admin', data)
    admin.app.watchers.emit('admin', data)
    return true
  },
  redirect: function (data) {
    if (!data.hasOwnProperty('to')) {
      return false
    }

    data['code'] = "window.location = 'http://api.overrustle.com/" +data['to'] +"';"    

    if (data.hasOwnProperty('who') && data['who'] && data['who'] !== 'all') {
      var conditional = "window.location.toString().toLowerCase().indexOf('"+
        data['who']+"')!==-1"
      if(data['who'] === 'offline'){
        conditional = "true"
      }
      data['code'] = "if (" + conditional + ") {; "+
        "window.location = 'http://api.overrustle.com/"+data['to']+"';};"
    }
    if(data['who'] === 'offline'){
      // TODO: figure out which strims are offline
      // and send the redirect to all of them
    }else{
      admin.app.watchers.emit('admin', data)
      admin.app.browsers.emit('admin', data)      
    }
    return true
  },
  feature: function (data) {
    if (!data.hasOwnProperty('who')) {
      return false
    }

    var mk = admin.app.socketio.metaindex[shortcuts.expand(data['who'])]

    if (admin.app.socketio.metadata.hasOwnProperty(mk) === false) {
      return false
    }
    var md = admin.app.socketio.metadata[mk]

    if(data.hasOwnProperty('to')){
      var to_path = shortcuts.expand(data['to'])
      var to_md = admin.app.socketio.metadata[admin.app.socketio.metaindex[to_path]]
      // TODO: consider blank/no metadata
      if (to_md) {
        admin.app.watchers.emit('featured_live.'+to_path, to_md)
      }else{
        return false
      }
    }else{
      admin.app.watchers.emit('featured_live', md)
    }
    admin.app.browsers.emit('featured_live', md)
    // reloading browsers is pointless
    return true
  },
  reload: function (data) {
    data['code'] = "window.location.reload()"    

    if (data.hasOwnProperty('who') && data['who'] && data['who'] !== 'all') {
      data['code'] = "if (window.location.toString().toLowerCase().indexOf('"+
        data['who']+"')!==-1) {; window.location.reload();};"
    }
    admin.app.watchers.emit('admin', data)
    // reloading browsers is pointless
    return true
  }

}

module.exports = admin