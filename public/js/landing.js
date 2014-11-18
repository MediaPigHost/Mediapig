define(['require', 'exports', 'module', 'helpers'], function (require, exports, module, helpers) {
  var landing = {
    init : function(){
      this.scrollEvents();
    },
    scrollEvents : function(){
      var animateStatus = [{}];
      window.onscroll = function (event) {
        if (window.pageYOffset > 500 && (animateStatus[0].active != 'true' || typeof animateStatus[0].active === 'undefined')) {
          var el = document.getElementsByClassName('oneclick-window');
          if (el) {
            el[0].className += ' animate';
          }
          animateStatus[0].active = 'true';
          setTimeout(function () {

            helpers.addEventListenerByClass('oneclick-window', 'mouseover', function(e){
              e.target.parentNode.className += ' animate-hover'
            });

            helpers.addEventListenerByClass('oneclick-window', 'mouseout', function(e){
              helpers.removeClass(el[0], 'animate-hover');
            });
          }, 900);
        }
      }
    }
  }
  module.exports = landing;
});
