define(['require', 'exports', 'module', 'helpers', 'microAjax'], function (require, exports, module, helpers, microAjax) {
  var order = {
    init : function(){
      this.events();
      this.calculatePrice();
    },
    startPurchase : function(){
      helpers.postJSON(siteObj.orderConfig, window.location.origin + '/post/order', function (xhr) {
          var overlay = document.getElementById("overlay-content");
          overlay.innerHTML += xhr.response;
          helpers.removeClass(overlay.parentNode, 'overlay-loading');

          var invoiceID = document.getElementById('invoice_id').getAttribute('value');
          stripe = new helpers.stripe();
          stripe.setInvoiceID(invoiceID);

          helpers.addEventListenerByClass('submit-card-details', 'click', function (event) {
              event.preventDefault();

              if (event.currentTarget.className.indexOf('disabled') > -1) {
                  return;
              }

              event.currentTarget.className += ' disabled';

              var formElements = document.getElementById("cardDetails").elements;
              stripe.setKey('pk_test_bszr3bswqa8VHE9zcaah6dhN');
              var cardDetails = {};

              for (var i = 0, length = formElements.length; i < length; i++) {
                  if (formElements[i].type !== "submit") {
                      cardDetails[formElements[i].name] = formElements[i].value;
                  }
              }

              stripe.createToken(cardDetails, function (status, response) {
                  if (status === 200) {
                      var token = response.id;

                      var orderDetails = {
                          invoice_id: +stripe.getInvoiceID(),
                          token: token
                      };

                      helpers.postJSON(orderDetails, 'https://api.mediapig.co.uk/index.php?/order/process', function (res) {
                          var response = JSON.parse(res.response);

                          if (response.status === 'success') {
                              alert('Success');
                          }
                          else {
                              event.target.className = event.target.className.replace(/(?:^|\s)disabled(?!\S)/, '');
                          }
                      });
                  }
                  else {
                      event.target.className = event.target.className.replace(/(?:^|\s)disabled(?!\S)/, '');
                  }
              }, function(status, response){
                document.getElementById('card-details-form-error').innerHTML = 'Error - Check logs for now.';
              });
          });
      });
    },
    createOrder: function(){

    },
    calculatePrice : function(){
      var sections = document.getElementsByClassName('order-grid'),
          price = parseFloat(siteObj.basePrice);

      siteObj.orderConfig.attributes = [];

      for (var i = 0, length = sections.length; i < length; i++) {
        var selected = sections[i].getElementsByClassName('selected');

        // Pull out selected child variation and add to order object.
        if (selected[0].getAttribute('data-name') === 'os'){
          var variationId = selected[0].getElementsByClassName('os-trigger')[0].getAttribute('data-id');
          siteObj.orderConfig.os_variant = parseInt(variationId);
        }

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
          optionElSiblings = optionSectionEl[0].getElementsByClassName('order-grid-item'),
          optionOSVariationEl = optionSectionEl[0].getElementsByClassName('os-variations');

      // Remove all dropdown active classes
      for (var i = 0; i < optionElSiblings.length; i++) {
        helpers.removeClass(optionElSiblings[i], "selected");
      }

      // Remove all os variation active classes
      for (var i = 0; i < optionOSVariationEl.length; i++) {
        helpers.removeClass(optionOSVariationEl[i], "selected");
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

      helpers.addEventListenerByClass('os-trigger', 'click', function(e){

        var target = e.currentTarget,
            targetParent = target.parentNode,
            siblings = targetParent.parentNode.parentNode.parentNode.getElementsByClassName('os-variations'),
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

        e.stopPropagation();
        e.preventDefault();
      });

      helpers.addEventListenerByClass('os-link', 'click', function(e){

        var target = e.currentTarget,
            targetValue = target.getAttribute('data-value'),
            targetId = target.getAttribute('data-id'),
            targetParent = target.parentNode,
            dropdown = targetParent.parentNode.parentNode,
            dropdownValue = dropdown.getElementsByClassName('option-value'),
            siblings = dropdown.getElementsByClassName('os-link');

        for (var i = 0, length = siblings.length; i < length; i++) {
            helpers.removeClass(siblings[i], "enabled");
        }

        target.className += " enabled";
        dropdownValue[0].innerHTML = targetValue;
        dropdownValue[0].setAttribute('data-id', targetId)
        e.preventDefault();
      });

      helpers.addEventListenerByClass('payment-trigger', 'click', function (e) {
        helpers.addBodyClass('overlay-visible');
        order.startPurchase();
        e.preventDefault();
      });

      helpers.addEventListenerByClass('overlay-close', 'click', function (e) {
        helpers.removeBodyClass('overlay-visible');
        // Cleanup view for next open
        document.getElementById('overlay-content').className += ' overlay-loading';
        document.getElementsByClassName('card-details-form')[0].outerHTML = "";
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
              dropdownParent = target.parentNode.parentNode.parentNode,
              sectionName = targetParent.getAttribute('data-name'),
              targetId = targetParent.getAttribute('data-product-id'),
              targetValue = targetParent.getAttribute('data-value');

          order.refreshSelectionViews(sectionName, targetId, targetValue);
          order.calculatePrice();

          helpers.removeClass(dropdownParent, "selected");

          e.preventDefault();
      });


    }
  }
  module.exports = order;
});
