
var helpers = {
  addEventListenerByClass : function (className, event, fn) {
    var list = document.getElementsByClassName(className);
    for (var i = 0, len = list.length; i < len; i++) {
      list[i].addEventListener(event, fn, false);
    }
  },
  addBodyClass : function (c) {
    return document.getElementsByTagName('body')[0].className +=' '+c;
  },
  removeBodyClass : function (c) {
    document.body.className = document.getElementsByTagName('body')[0].className.replace(c,"");
  },
  removeElementsByClass : function (className) {
    elements = document.getElementsByClassName(className);
    while(elements.length > 0){
        elements[0].parentNode.removeChild(elements[0]);
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
  }
}

module.exports = helpers;
