define(['require', 'exports', 'module'], function (require, exports, module) {
  var landing = {
    init : function(){
      this.scrollEvents();
    },
    scrollEvents : function(){
      var animateStatus = [{}];
      window.onscroll = function (event) {
        if (window.pageYOffset > 1000 && (animateStatus[0].active != 'true' || typeof animateStatus[0].active === 'undefined')) {
          var el = document.getElementsByClassName('oneclick-window');
          if (el) {
            el[0].className += ' animate';
          }
          animateStatus[0].active = 'true';
          setTimeout(function () {

            app.help.addEventListenerByClass('oneclick-window', 'mouseover', function(e){
              e.target.parentNode.className += ' animate-hover'
            });

            app.help.addEventListenerByClass('oneclick-window', 'mouseout', function(e){
              app.help.removeClass(el[0], 'animate-hover');
            });
          }, 900);
        }
      }
    }
  }
  module.exports = landing;
});
