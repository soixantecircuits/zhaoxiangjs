var Main = (function(my, GPhoto){
  my.gif = {};
  my.showGui = false;
  my.nbImgCountdownAnim = 7;
  my.animDurationArray = [1600,700,700,700,700,1400,1800];

  my.initSocket = function(){
    var socket = io.connect('http://localhost:1789');
    socket.on('countdown', function(duration){
      my.showGifCount(duration);
    });
  };

  my.showGifCount = function(duration){
    $('#imageWrap').fadeOut(400);
    $('#counter').fadeIn(400, function() {
      my.countdownAnimation.play(function(){
        setTimeout(function(){
          window.gphoto.getLastPicture(function(){
            my.showStream(function(){
              setTimeout(function(){$('#imageWrap').fadeOut(400);}, 5000);
            });
          });
        }, 500);
      });
    });
  };

  my.showStream = function(callback){
    $('#counter').fadeOut(400);
    $('#imageWrap').fadeIn(400, callback);
  };

  my.countdownAnimation = {
    images: [],
    target: document.getElementById('countdownAnimImg'),
    // Preload images
    init: function(){
      for(var i=0; i<my.nbImgCountdownAnim; i++){
        var actualIndex = i+1;
        var path = window.location.origin+'/img/countdown_';
        path += (actualIndex <10) ? '0'+actualIndex+'.png' : actualIndex+'.png';
        this.images[i] = new Image();
        this.images[i].src = path;
      }
    },
    changeAnimImg: function(index, callback){
      var _self = this;
      // Make first image stay longer
      var delay = 0;
      for(var i = 0; i < index; i++){
        delay +=   my.animDurationArray[i];
      }
      setTimeout(function(){ 
        _self.target.src = _self.images[index].src;
        if(typeof callback == 'function'){
          setTimeout(function(){ _self.target.src = ''; callback(); },  my.animDurationArray[index]);
        } 
      }, delay);
    },
    // Play animation
    play: function(callback){
      var _self = this;
      $('body').addClass('countdown');
      for(var i=0; i<_self.images.length; i++){
        var extendendDuration = false;

        if(i+1 == _self.images.length){
          this.changeAnimImg(i, function(){
            $('body').removeClass('countdown');
            callback();
          });
        } else {
          this.changeAnimImg(i);
        }
      }
    },
  }

  my.initStream = function(){
    window.gphoto.startPreview(8088);
  };

  my.initGphoto = function(){
    window.gphoto = new GPhoto();
    if(my.showGui){
      window.gphoto.displaySettings();
    }
  };

  my.init = function(){
    my.initGphoto();
    my.initSocket();
    // my.initStream();
    my.countdownAnimation.init();
  };

  return my;
}(Main || {}, GPhoto || {}));

Main.init();