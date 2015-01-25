// client side code

var socket = io('http://api.overrustle.com/stream', {
  reconnectionDelay: 500+(5000*Math.random())
});
// var socket = io('http://localhost:9998');

var path = window.location.href.replace(window.location.origin, "")
if(/s=(twitch|hitbox|mlg)/gi.test(path)){
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

socket.on('featured_live', feature)
socket.on('featured_live.'+path, feature)

function feature (metadata) {
  // don't bother people if they're already looking at a specific stream
  // this could be solved on the backend
  // with separate namespaces per stream
  // and then NOT sending to this namespace
  if(path === metadata['url']){
    return
  }
  var label = metadata['name'] ? metadata['name'] : metadata['channel']
  // todo: change wording if they're not live for some reason
  if (metadata['live']) {
    label = label + " is live!"
  }else{
    label = "Check out " + label
  }

  var body = "Click To Watch"
  if (metadata['rustlers']) {
    body = body + " with " + metadata['rustlers'] + " rustlers."
  }else if (metadata['viewers']) {
    body = body + " with " + metadata['viewers'] + " viewers."
  }

  Notify(label, {
    // tag is a UID that makes the browser replace 
    // data within notifications with the same UID
    // instead of pushing out a totally new one
    tag: metadata['url'],
    icon: metadata.image_url,
    body: body, 
    onclick: function () {
      window.location = metadata['url']
    }
  })
}

function Notify (title, options) {
  Notification.requestPermission( function (permission){
    var n = new Notification(title, options)
    n.onclick = options['onclick']
    n.onerror = options['onerror']
    n.onshow  = options['onshow']
    n.onclose = options['onclose']
  })  
}
