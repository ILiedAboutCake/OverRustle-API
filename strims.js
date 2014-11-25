// client side code

var socket = io('http://api.overrustle.com');

socket.on('strims', function(api_data){
  var strims = api_data["streams"]
  var curloc = window.location.href.replace(window.location.origin, "").toLowerCase()
  $('#server-broadcast').html(strims[curloc]); // not using formatNumber
});
