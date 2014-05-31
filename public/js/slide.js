define(['require', 'exports', 'module', 'js/move', 'js/helpers'], function(require, exports, module, move, helpers) {
  var maxMovement,
    slider = {
    init : function(el, config){
      console.log(el);
      var child = el.getElementsByClassName(config.childClass);
      var childWidth = 0;
      for (var x = 0; x < child[0].childNodes.length; x++) {
        var childNode = child[0].childNodes[x];
        childWidth += childNode.offsetWidth;
      }
      var movementRoom = childWidth - child[0].offsetWidth;
      child[0].style.width = childWidth + 'px';
      var childRect = child[0].getBoundingClientRect();
      var parentRect = el.getBoundingClientRect();
      var parentPadding = (el.offsetWidth - child[0].offsetWidth + movementRoom) /2;
      var childX = childRect.left;
      var parentX = parentRect.left + parentPadding;

      var data = {
        'childx' : childX,
        'parentx' : parentX,
        'movementRoom' : movementRoom,
        'childWidth' : child[0].offsetWidth,
        'childrenWidth' : childWidth
      }

      slider.createArrows(el, config, data);
    },
    createArrows : function(parent, config, data){
      console.log(parent);
      var larrow = '<a href="#" class="slide-arrow-left icon-arrow-left"></a>';
      var rarrow = '<a href="#" class="slide-arrow-right icon-uniE604"></a>';
      parent.insertAdjacentHTML('beforeend', larrow);
      parent.insertAdjacentHTML('beforeend', rarrow);
      slider.arrowEvents(parent, config, data);
    },
    arrowEvents : function(nav, config, data){

      move.defaults = {
        duration: 5000
      };

      nav.getElementsByClassName('slide-arrow-right')[0].addEventListener('mouseenter', function(e){
        var targetParent = e.currentTarget.parentNode.getElementsByClassName(config.childClass)[0];
        move.defaults.duration = targetParent.childNodes.length * 250;
        var movepos = data.movementRoom + ((data.childx - data.parentx) * 2);
        move(targetParent).set('margin-left', '-'+movepos).end();
        targetParent.style.webkitAnimationPlayState = "running";
      });

      nav.getElementsByClassName('slide-arrow-left')[0].addEventListener('mouseenter', function(e){
        var targetParent = e.currentTarget.parentNode.getElementsByClassName(config.childClass)[0];
        move.defaults.duration = targetParent.childNodes.length * 250;
        move(targetParent).set('margin-left', 0).end();
        targetParent.style.webkitAnimationPlayState = "running";
      });

      nav.getElementsByClassName('slide-arrow-right')[0].addEventListener('mouseleave', function(e){
        var targetParent = e.currentTarget.parentNode.getElementsByClassName(config.childClass)[0];
        move.defaults.duration = targetParent.childNodes.length * 250;
        targetParent.style.webkitTransitionDuration = '0s';
        targetParent.style.webkitAnimationPlayState = "paused";
        targetParent.style.marginLeft = move(targetParent).current('margin-left');
      });

      nav.getElementsByClassName('slide-arrow-left')[0].addEventListener('mouseleave', function(e){
        var targetParent = e.currentTarget.parentNode.getElementsByClassName(config.childClass)[0];
        move.defaults.duration = targetParent.childNodes.length * 250;
        targetParent.style.webkitTransitionDuration = '0s';
        targetParent.style.webkitAnimationPlayState = "paused";
        targetParent.style.marginLeft = move(targetParent).current('margin-left');
      });
    }
  }
  module.exports = slider;
});
