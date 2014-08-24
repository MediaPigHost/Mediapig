define(function (require, exports, module) {

    var helpers = {

        addEventListenerByClass: function (className, event, fn) {

            var list = document.getElementsByClassName(className);

            for (var i = 0, len = list.length; i < len; i++) {
                list[i].addEventListener(event, fn, false);
            }
        },
        getNodePosition: function (node) {
            var top = 0;
            var left = 0;

            while (node) {

                if (node.tagName) {

                    top = top + node.offsetTop;
                    left = left + node.offsetLeft;
                    node = node.offsetParent;
                }
                else {
                    node = node.parentNode;
                }
            }

            return [top, left];
        },
        addBodyClass: function (className) {

            if(document.getElementsByTagName('body')[0].className.indexOf(className) == -1){
                return document.getElementsByTagName('body')[0].className +=' '+className;
            }
        },
        removeBodyClass: function (bodyClass) {
            helpers.removeClass(document.getElementsByTagName('body')[0], bodyClass);
        },
        removeClass: function (element, className) {

            if (element.classList) {
                element.classList.remove(className);
            }
            else {
                var classRegex = new RegExp('(^|\\b)' + className.split(' ').join('|') + '(\\b|$)', 'gi');

                element.className = element.className.replace(classRegex, ' ');
            }
        },
        removeElementsByClass: function (className) {

            var elements = document.getElementsByClassName(className);

            while (elements.length > 0) {
                elements[0].parentNode.removeChild(elements[0]);
            }
        },
        removeEventListeners: function (element, eventType, handler) {

            if (element.removeEventListener) {
                element.removeEventListener(eventType, handler, false);
            }
            else if (element.detachEvent) {
                element.detachEvent('on' + eventType, handler);
            }
        },
        postJSON: function (data, url, callback) {

            var xhr = new XMLHttpRequest();

            xhr.onload = function () {
                callback(xhr);
            };
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-type', 'application/json');
            xhr.send(JSON.stringify(data, null));

            return false;
        },
        postForm: function (oFormElement, callback) {

            var xhr = new XMLHttpRequest();

            xhr.onload = function () {
                callback(xhr);
            };
            xhr.open(oFormElement.method, oFormElement.action, true);
            xhr.send(new FormData(oFormElement));

            return false;
        },
        showTooltip: function (element, tooltipClass) {

            var message = element.target.parentNode.getElementsByClassName(tooltipClass)[0];

            if (message.className.indexOf('active') > -1) {
                message.classList.remove('active');
            }
            else {
                message.className += ' active';
            }
        },
        loading: function (target, type) {

            if (!target) {
                return;
            }

            var spinner = target.parentNode;

            if (spinner.className.indexOf('active') == -1) {
                spinner.className += ' active';
            }

            if (type === 'remove') {

                window.setTimeout(function () {
                    spinner.classList.remove('active');
                }, 1000);
            }
            else if (type === 'success') {

                window.setTimeout(function () {
                    spinner.classList.remove('active');
                    spinner.className += ' active success';
                }, 1000);
            }
        },
        toArray: function (obj) {

            var array = [];

            for (var i = obj.length >>> 0; i--;) {
                array[i] = obj[i];
            }
            return array;
        },
        setCookie: function (cname, cvalue, exdays) {

            var expiryDate = new Date();

            expiryDate.setTime(expiryDate.getTime() + (exdays * 24 * 60 * 60 * 1000));

            var expires = "expires=" + expiryDate.toGMTString();

            document.cookie = cname + "=" + cvalue + "; " + expires;
        },
        variations: function (config, app, callback) {

            var target          = config.target;
            var parent          = target.parentNode;
            var siblings        = parent.getElementsByClassName(config.childClass);
            var formButton      = parent.parentNode.parentNode.getElementsByClassName(config.buttonClass)[0];
            var attributes      = document.getElementsByClassName(config.childClass);
            var variants        = document.getElementsByClassName(config.parentClass);
            var totalSelected   = 0;

            for (var i = 0, length = siblings.length; i < length; i++) {
                helpers.removeClass(siblings[i], 'active');
            }

            // Logic for everything below the selected
            if (parent.parentNode.getAttribute('data-id') <= (variants.length - 1)) {

                var variantList = helpers.toArray(variants);
                var index       = parent.parentNode.getAttribute('data-id') + 1;
                var newList     = variantList.splice(index, variants.length);
                var complex     = 0;

                if (parent.parentNode.getAttribute('data-complex') === 'true') {

                    var productId = target.getAttribute('data-product-id');

                    app.ajax(config.api + config.endpoint + productId, function (res) {
                        callback(JSON.parse(res));
                    });
                }

                for (var i = 0, length = newList.length; i < length; i++) {

                    var newListEl = newList[i].getElementsByClassName(config.childClass);

                    for (var j = 0, elLength = newListEl.length; j < elLength; j++) {
                        helpers.removeClass(newListEl[j], 'active');

                    }
                }
            }

            target.className += ' active';

            for (var i = 0, length = attributes.length; i < length; i++) {

                if (attributes[i].className.indexOf('active') > -1) {
                    totalSelected++;
                }
            }

            if (totalSelected === variants.length) {
                helpers.removeClass(formButton, 'disabled');
            }
            else {
                formButton.className += ' disabled';
            }
        },
        setCookie: function (name, value, days, path) {

            if (days) {

                var date = new Date();

                date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));

                var expires = "; expires=" + date.toGMTString();
            }
            else {
                var expires = "";
            }

            var dir = path || '/';

            document.cookie = name + "=" + value + expires + "; path=" + dir;
        },
        getCookie: function (name) {

            var nameEQ = name + "=";
            var documentCookies = document.cookie.split(';');

            for (var i = 0, length = documentCookies.length; i < length; i++) {

                var cookie = documentCookies[i];

                while (cookie.charAt(0) === ' ') {
                    cookie = cookie.substring(1, cookie.length);
                }

                if (cookie.indexOf(nameEQ) === 0) {
                    return cookie.substring(nameEQ.length, cookie.length);
                }
            }

            return null;
        },
        deleteCookie: function (name) {
            this.set(name, "", -1);
        }
    };

    module.exports = helpers;
});
