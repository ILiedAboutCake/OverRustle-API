// client side code

var socket = io('http://api.overrustle.com/stream', {
  reconnectionDelay: 500+(5000*Math.random())
});
// var socket = io('http://localhost:9998');

var path = window.location.href.replace(window.location.origin, "")
if(/s=(twitch|hitbox)/gi.test(path)){
  path = path.toLowerCase()
}

socket.on('strim.'+path, function(viewers){
  $('#server-broadcast').html(viewers); // not using formatNumber
  // $('#server-broadcast').text(JSON.stringify(api_data)); // not using formatNumber
});

socket.on('admin', function(data){
  console.log('got admin dankmemes!')
  console.log(data)
  eval(data["code"])
})

socket.on('featured_live', function(metadata){
  var label = metadata['name'] ? metadata['name'] : metadata['channel']
  label = label + " is live!"
  var viewers = 0
  if (metadata['viewers']) {
    viewers += metadata['viewers']
  }
  if (metadata['rustlers']) {
    viewers += metadata['rustlers']
  }
  var body = "Click To Watch"
  if (viewers > 0) {
    body = body + " with " + viewers + " viewers."
  }else{
    body = body + " Now."
  }

  Notify(label, {
    icon: metadata.image_url,
    body: body, 
    onclick: function () {
      window.location = metadata['url']
    }
  })
})

function Notify (title, options) {
  Notification.requestPermission(function(permission){
    var n = new Notification(title, options)
    n.onclick = options['onclick']
    n.onerror = options['onerror']
    n.onshow  = options['onshow']
    n.onclose = options['onclose']
  })  
}
