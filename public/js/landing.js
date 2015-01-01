define(['require', 'exports', 'module', 'helpers'], function (require, exports, module, helpers) {
  var landing = {
    init : function(){
      this.events();
      this.scrollEvents();
    },
    events : function(){
      var productOverviewButton = document.getElementById('product-overview-more'),
          productOverview = document.getElementById('product-overview');

      productOverviewButton.addEventListener('click', function (e) {
        e.preventDefault();
        productOverview.className += ' expanded';
      });
    },
    scrollEvents : function(){
      var animateStatus = [{}];
      window.onscroll = function (event) {
        if (window.pageYOffset > 400 && (animateStatus[0].active != 'true' || typeof animateStatus[0].active === 'undefined')) {
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
