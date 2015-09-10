var Main = (function(my, GPhoto){
  my.gif = {};

  my.initSocket = function(){
    var socket = io.connect('http://localhost:1789');
    socket.on('countdown', function(duration){
      my.showGifCount(duration);
    });
  };

  my.showGifCount = function(duration){
    $('#imageWrap').fadeOut('400');
    $('#counter').fadeIn(400, function() {
      my.gif.play();
      setTimeout(function(){
        $('#imageWrap').fadeIn('400');
        $('#counter').fadeOut('400', function() {
          my.gif.pause();
          my.gif.move_to(0);
        });
      }, duration*1000);
    });
  };

  my.initStream = function(){
    GPhoto.startPreview(8088);
  };

  my.initGif = function(){
    $(document).ready(function() {
      var images = $('img');

      if (/.*\.gif/.test(images[0].src)) {
        console.log('salut');
        my.gif = new SuperGif({ gif: images[0] } );
        my.gif.load(function(){
          console.log('Countdown gif loaded');
        });
      }
    });
  }

  my.init = function(){
    my.initSocket();
    my.initStream();
    my.initGif();
  };

  return my;
}(Main || {}, window.gphoto || {}));

Main.init();