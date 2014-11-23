define(['require', 'exports', 'module', 'helpers', 'microAjax'], function (require, exports, module, helpers, microAjax) {
  var account = {
    init : function(){
      this.events();
    },
    events : function(){
      console.log('events');
    }
  }
  module.exports = account;
});
