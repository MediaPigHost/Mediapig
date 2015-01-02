define(['require', 'exports', 'module', 'helpers', 'microAjax'], function (require, exports, module, helpers, microAjax) {
  var order = {
    init : function(){
      this.events();
      this.subscriptions();
      this.calculatePrice();
    },
    startPurchase : function(){
      helpers.postJSON(siteObj.orderConfig, window.location.origin + '/post/order', function (xhr) {
          if (xhr.response === 'redirect'){
            window.location.href = '/manage';
            return false;
          } else {
            ga('send', 'event', 'overlay', 'signup visible');
            var overlay = document.getElementById("overlay-content");
            var signup = document.getElementById("signup-form-wrap");
            if (signup && signup.length){
              signup.parentNode.removeChild(signup);
            }
            overlay.parentNode.className += ' order-overlay';
            overlay.innerHTML += xhr.response;
            helpers.removeClass(overlay.parentNode, 'overlay-loading');

            var serviceID = document.getElementById('service_id').getAttribute('value');
            stripe = new helpers.stripe();
            stripe.setServiceID(serviceID);
            var form = document.getElementById('cardDetails');
            form.addEventListener('submit', function (event) {
                event.preventDefault();

                var submitEl = document.getElementById('submitCardDetails');
                if (submitEl.className.indexOf('disabled') > -1) {
                    return;
                }

                submitEl.className += ' disabled';

                var formElements = form.elements;
                if (siteObj.stripe_mode === 'test'){
                  console.log('Loading stripe in test mode');
                  stripe.setKey('pk_test_zKac1uVceOsFFMCWOCEl90oo');
                } else {
                  console.log('Stripe in live mode');
                  stripe.setKey('pk_live_J61gKzscdY3Rxtctc7Uyi0Rb');
                }
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
                            service_id: stripe.getServiceID(),
                            token: token,
                            first_name: cardDetails.firstname,
                            last_name: cardDetails.surname
                        };

                        helpers.postJSON(orderDetails, '/order/process', function (res) {
                            var response = JSON.parse(res.response);

                            if (response.status === 'success') {
                                window.location.href = '/manage';
                            } else {
                                submitEl.className = submitEl.className.replace(/(?:^|\s)disabled(?!\S)/, '');
                                app.publish('/message/error', response.errors);
                            }
                        });
                    }
                    else {
                        submitEl.className = submitEl.className.replace(/(?:^|\s)disabled(?!\S)/, '');
                        app.publish('/message/error', "Incorrect card details - Please check again!");
                    }
                }, function(status, response){
                  document.getElementById('card-details-form-error').innerHTML = 'Error - Check logs for now.';
                });
            });
          }
      });
    },
    startDiscount: function(){
      app.ajax(window.location.origin + '/page/discount', function (res) {
        var overlay = document.getElementById("overlay-content");
        overlay.parentNode.className += ' discount-overlay';
        helpers.removeClass(overlay.parentNode, 'overlay-loading');
        overlay.innerHTML += res;

        var discount = document.getElementById("discount"),
            discountCode = document.getElementById("discount-code");

        discount.addEventListener("keyup", function (e) {
          if (discountCode.value.length > 4) {
            if(!discount.parentNode.classList.contains('enabled')){
              app.publish('/discount/validate', discountCode.value);
            }
          } else {
            if(discount.parentNode.classList.contains('enabled')){
              helpers.removeClass(discount.parentNode, 'enabled');
            }
          }
        });

        discount.addEventListener("submit", function (e){
          e.preventDefault();
          app.publish('/discount/validate', discountCode.value);
        });
      });

      app.subscribe("/discount/post", function(code) {
        var discount = document.getElementById("discount"),
            formDetails = {};
        discount = discount.elements;

        for (var i = 0, length = discount.length; i < length; i++) {
          if (discount[i].type !== "submit") {
            formDetails[discount[i].name] = discount[i].value;
          }
        }

        siteObj.orderConfig['discount_code'] = formDetails.code;

        helpers.postJSON(formDetails, '/discount/verify', function (res) {
            var response = JSON.parse(res.response);

            if (response.status === 'success') {
              app.publish('/discount/success', response);
            } else {
              app.publish('/discount/fail', response);
            }
        });
      });

      app.subscribe("/discount/validate", function(){
        var discount = document.getElementById("discount"),
            discountCode = document.getElementById("discount-code");

        discount.parentNode.className += ' enabled';
        discountCode.disabled = true;
        app.publish('/discount/post', discountCode.value);
      });

      app.subscribe("/discount/success", function(res) {
        var discountForm = document.getElementById("discount-form");
        helpers.removeClass(discountForm, 'enabled');
        discountForm.className += ' success';
        setTimeout(function () {
          app.publish('/overlay/close', {});
          siteObj.discountPercentage = res.discount_percent;
          order.calculatePrice();
          app.publish('/discount/applied', {});
        }, 1000);
      });

      app.subscribe("/discount/fail", function(res) {
        var discount = document.getElementById("discount"),
            discountCode = document.getElementById("discount-code");
        discountCode.disabled = false;
        helpers.removeClass(discount.parentNode, 'enabled');
        app.publish('/message/error', res.errors);
      });
    },
    calculatePrice : function(){
      var sections = document.getElementsByClassName('order-grid'),
          price = parseFloat(siteObj.basePrice),
          decimals = 2;

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

      if (typeof siteObj.discountPercentage != 'undefined'){
          price = parseFloat(price - (price / 100 * siteObj.discountPercentage));
      }

      if (siteObj.term != 'month'){
        // hourly
        price = parseFloat(price / 666);
        decimals = 3;
      }

      helpers.removeClass(document.getElementById('order-button'), 'disabled');
      document.getElementById('order-total-value').innerHTML = (parseFloat(price)).toFixed(decimals);
      ga('send', 'event', 'price change', 'new selection');
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
        ga('send', 'event', 'click', 'payment trigger');
        e.preventDefault();
      });

      helpers.addEventListenerByClass('discount-trigger', 'click', function (e) {
        helpers.addBodyClass('overlay-visible');
        order.startDiscount();
        ga('send', 'event', 'click', 'discount trigger');
        e.preventDefault();
      });

      helpers.addEventListenerByClass('overlay-close', 'click', function (e) {
        app.publish('/overlay/close', e);
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

      document.getElementById('month-multi').addEventListener('click', function (e) {
        e.preventDefault();
        ga('send', 'order', 'click', 'monthly trigger');
        siteObj.term = 'month';
        var term = document.getElementById('selected-term');
        term.innerHTML = this.innerHTML;
        order.calculatePrice();
      });

      document.getElementById('hour-multi').addEventListener('click', function (e) {
        e.preventDefault();
        ga('send', 'order', 'click', 'hourly trigger');
        siteObj.term = 'hour';
        var term = document.getElementById('selected-term');
        term.innerHTML = this.innerHTML;
        order.calculatePrice();
      });
    },
    subscriptions: function(){
      app.subscribe("/overlay/close", function() {
        helpers.removeBodyClass('overlay-visible');
        // Cleanup view for next open
        document.getElementById('overlay-content').parentNode.className = 'overlay-wrap overlay-loading';

        var cardform = document.getElementById("card-details-form-wrap");
        if (cardform){
          cardform.parentNode.removeChild(cardform);
        }

        var signup = document.getElementById("signup-form-wrap");
        if (signup){
          signup.parentNode.removeChild(signup);
        }

        var discount = document.getElementById("discount-form");
        if (discount){
          discount.parentNode.removeChild(discount);
        }

        if (typeof e != 'undefined') {
          e.preventDefault();
        }
      });

      app.subscribe("/discount/applied", function() {
        helpers.addBodyClass('discount-applied');
        ga('send', 'order', 'price change', 'discount applied');
        setTimeout(function () {
          helpers.addBodyClass('discount-applied-fadeout');
          helpers.removeBodyClass('discount-applied');
        }, 5000);

        setTimeout(function () {
          helpers.removeBodyClass('discount-applied-fadeout');
        }, 7000);
      });

      app.subscribe("/form/register/update", function (flag) {
        if (flag === 'success'){
          document.getElementById('overlay-content').parentNode.className += ' overlay-loading';
          order.startPurchase();
        }
      });
    }
  }
  module.exports = order;
});
