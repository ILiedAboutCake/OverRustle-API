// client side code

var socket = io('http://api.overrustle.com');
// var socket = io('http://localhost:9998');

socket.on('strims', function(api_data){
  var strims = api_data["streams"]
  var curloc = window.location.href.replace(window.location.origin, "").toLowerCase()
  $('#server-broadcast').html(strims[curloc]); // not using formatNumber
  // $('#server-broadcast').text(JSON.stringify(api_data)); // not using formatNumber
});
