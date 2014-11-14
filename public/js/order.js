define(['require', 'exports', 'module', 'helpers'], function (require, exports, module, helpers) {
  var order = {
    init : function(){
      this.events();
    },
    events : function(){
      helpers.addEventListenerByClass('order-grid-item', 'click', function (e) {

          var target = e.currentTarget,
              selectionParent = target.parentNode;
              siblings = selectionParent.getElementsByClassName('order-box');

          for (var i = 0, length = siblings.length; i < length; i++) {
            helpers.removeClass(siblings[i].parentNode, "selected");
          }
          target.className += " selected";

          e.preventDefault();
      });


      helpers.addEventListenerByClass('option-trigger', 'click', function (e) {

          var target = e.currentTarget,
              selectionParent = target.parentNode;
              siblings = selectionParent.parentNode.getElementsByClassName('option'),
              isSelected = false;

          if (selectionParent.className.match(/\bselected\b/)) {
              helpers.removeClass(selectionParent, "selected");
              isSelected = true;
          }

          for (var i = 0, length = siblings.length; i < length; i++) {
              helpers.removeClass(siblings[i], "selected");
          }

          if (!isSelected) {
              selectionParent.className += " selected";
          }

          isSelected = false;

          e.preventDefault();
      });

    }
  }
  module.exports = order;
});
