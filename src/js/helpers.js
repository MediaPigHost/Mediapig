
var helpers = {
  addEventListenerByClass : function (className, event, fn) {
    var list = document.getElementsByClassName(className);
    for (var i = 0, len = list.length; i < len; i++) {
      list[i].addEventListener(event, fn, false);
    }
  },
  addBodyClass : function (c) {
    if(document.getElementsByTagName('body')[0].className.indexOf(c) == -1){
      return document.getElementsByTagName('body')[0].className +=' '+c;
    }
  },
  removeBodyClass : function (c) {
    helpers.removeClass(document.getElementsByTagName('body')[0], c);
  },
  removeClass : function (el, className) {
    if (el.classList){
      el.classList.remove(className);
    } else {
      el.className = el.className.replace(new RegExp('(^|\\b)' + className.split(' ').join('|') + '(\\b|$)', 'gi'), ' ');
    }
  },
  removeElementsByClass : function (className) {
    elements = document.getElementsByClassName(className);
    while(elements.length > 0){
        elements[0].parentNode.removeChild(elements[0]);
    }
  },
  removeEventListeners : function (elem,eventType,handler) {
    if (elem.removeEventListener) {
      elem.removeEventListener (eventType,handler,false);
    }
    if (elem.detachEvent) {
      elem.detachEvent ('on'+eventType,handler);
    }
  },
  postForm : function(oFormElement, cb){
    var xhr = new XMLHttpRequest();
    xhr.onload = function(){ cb(xhr) };
    xhr.open (oFormElement.method, oFormElement.action, true);
    xhr.send (new FormData (oFormElement));
    return false;
  },
  showTooltip : function(e, tooltipClass) {
    var message = e.target.parentNode.getElementsByClassName(tooltipClass)[0];
    if(message.className.indexOf("active") > -1){
      message.classList.remove('active');
    } else {
      message.className += ' active';
    }
  },
  loading : function(target, type){
    if (!target) return;
    var spinner = target.parentNode;
    if(spinner.className.indexOf("active") == -1){
      spinner.className += ' active';
    }
    if(type === 'remove'){
      window.setTimeout(function() {
        spinner.classList.remove('active');
      }, 1000);
    }
    if(type === 'success'){
      window.setTimeout(function() {
        spinner.classList.remove('active');
        spinner.className += ' active success';
      }, 1000);
    }
  },
  setCookie : function(cname,cvalue,exdays) {
    var d = new Date();
    d.setTime(d.getTime()+(exdays*24*60*60*1000));
    var expires = "expires="+d.toGMTString();
    document.cookie = cname + "=" + cvalue + "; " + expires;
  }
}

module.exports = helpers;
