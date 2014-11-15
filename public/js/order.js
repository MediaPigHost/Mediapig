define(['require', 'exports', 'module', 'helpers'], function (require, exports, module, helpers) {
  var order = {
    init : function(){
      this.events();
      this.calculatePrice();
    },
    calculatePrice : function(){
      var sections = document.getElementsByClassName('order-grid'),
          price = parseFloat(siteObj.basePrice);

      siteObj.orderConfig.attributes = [];

      for (var i = 0, length = sections.length; i < length; i++) {
        var selected = sections[i].getElementsByClassName('selected');

        var selectedPrice = selected[0].getAttribute('data-price');
        siteObj.orderConfig.attributes.push(parseInt(selected[0].getAttribute('data-product-id')));

        if (selectedPrice !== null && typeof selectedPrice !== 'undefined'){
          price += parseFloat(selectedPrice);
        }
      }
      helpers.removeClass(document.getElementById('order-button'), 'disabled');
      document.getElementById('order-total-value').innerHTML = (parseFloat(price)).toFixed(2);
    },
    refreshSelectionViews : function(name, id, value){
      var dropdownSelectedEl = document.getElementsByClassName('option-' + name);

      // Length check for dropdown as OS dropdown doesn't exist.
      if (dropdownSelectedEl.length){

        var dropdownTriggerEl = dropdownSelectedEl[0].getElementsByClassName('option-trigger'),
            dropdownListEl = dropdownSelectedEl[0].getElementsByClassName('option-dropdown'),
            dropdownEl = dropdownListEl[0].querySelectorAll('[data-product-id="'+id+'"] a'),
            dropdownElValue = dropdownEl[0].getElementsByClassName('option-value'),
            dropdownElSiblings = dropdownEl[0].parentNode.parentNode.getElementsByTagName('li');

        // Updating dropdown value
        dropdownTriggerEl[0].getElementsByClassName('option-value')[0].innerHTML = value;

        // Remove all dropdown active classes
        for (var i = 0; i < dropdownElSiblings.length; i++) {
          helpers.removeClass(dropdownElSiblings[i].getElementsByClassName('option-link')[0], "enabled");
        }
        // Add new dropdown active class
        dropdownEl[0].className += " enabled";

      }

      var optionSectionEl = document.getElementsByClassName('section-' + name),
          optionEl = optionSectionEl[0].querySelectorAll('[data-product-id="'+id+'"]'),
          optionElSiblings = optionSectionEl[0].getElementsByClassName('order-grid-item');

      // Remove all dropdown active classes
      for (var i = 0; i < optionElSiblings.length; i++) {
        helpers.removeClass(optionElSiblings[i], "selected");
      }

      optionEl[0].className += " selected";

    },
    events : function(){
      helpers.addEventListenerByClass('order-grid-item', 'click', function (e) {

          var target = e.currentTarget,
              sectionName = target.getAttribute('data-name'),
              targetId = target.getAttribute('data-product-id'),
              targetValue = target.getAttribute('data-value');

          order.refreshSelectionViews(sectionName, targetId, targetValue);
          order.calculatePrice();

          e.preventDefault();
      });

      helpers.addEventListenerByClass('payment-trigger', 'click', function (e) {
        helpers.addBodyClass('overlay-visible');
        e.preventDefault();
      });

      helpers.addEventListenerByClass('overlay-close', 'click', function () {
        helpers.removeBodyClass('overlay-visible');
        e.preventDefault();
      });

      helpers.addEventListenerByClass('option-trigger', 'click', function (e) {

          var target = e.currentTarget,
              targetParent = target.parentNode;
              siblings = targetParent.parentNode.getElementsByClassName('option'),
              isSelected = false;

          if (targetParent.className.match(/\bselected\b/)) {
              helpers.removeClass(targetParent, "selected");
              isSelected = true;
          }

          for (var i = 0, length = siblings.length; i < length; i++) {
              helpers.removeClass(siblings[i], "selected");
          }

          if (!isSelected) {
              targetParent.className += " selected";
          }

          isSelected = false;

          e.preventDefault();
      });

      helpers.addEventListenerByClass('option-link', 'click', function (e) {

          var target = e.currentTarget,
              targetParent = target.parentNode,
              sectionName = targetParent.getAttribute('data-name'),
              targetId = targetParent.getAttribute('data-product-id'),
              targetValue = targetParent.getAttribute('data-value');

          order.refreshSelectionViews(sectionName, targetId, targetValue);
          order.calculatePrice();

          e.preventDefault();
      });


    }
  }
  module.exports = order;
});
