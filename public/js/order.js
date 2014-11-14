define(['require', 'exports', 'module', 'helpers'], function (require, exports, module, helpers) {
  var order = {
    init : function(){
      this.events();
    },
    calculatePrice : function(){
      var sections = document.getElementsByClassName('order-grid'),
          price = parseFloat(siteObj.basePrice);

      for (var i = 0, length = sections.length; i < length; i++) {
        var selected = sections[i].getElementsByClassName('selected'),
            selectedPrice = selected[0].getAttribute('data-price');
        if (selectedPrice !== null && typeof selectedPrice !== 'undefined'){
          price += parseFloat(selectedPrice);
        }
      }

      document.getElementById('order-total-value').innerHTML = (parseFloat(price)).toFixed(2);
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

          order.calculatePrice();

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
