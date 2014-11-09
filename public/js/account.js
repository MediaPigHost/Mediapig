$(document).ready(function(){

  /* Custom select box */
  $("select").each(function(){
    $(this).wrap('<div class="selectbox"/>');
    $(this).after("<span class='selecttext'></span><span class='select-arrow'></span>");
    var val = $(this).children("option:selected").text();
    $(this).next(".selecttext").text(val);
    $(this).change(function(){
      var val = $(this).children("option:selected").text();
      $(this).next(".selecttext").text(val);
    });
        var selectId = $(this).attr('id');
        if( selectId !== undefined ){
            var linkClass = selectId;
        } 
        if(linkClass){
            $(this).parent('.selectbox').addClass(linkClass);
        }
  });

  /* Dismiss notification */
  $("#remove").click(function(){
      $('#panel').remove();
  });

  /* Payment method modal */
  var modal = $('.method-modal');
  $(".method-btn").on("click", function() {
    $(modal).toggleClass('method-modal--show');
  });

  $(".method-overlay").on("click", function() {
    $(modal).toggleClass('method-modal--show');
  });

  $(".method-modal__close").on("click", function() {
    $(modal).toggleClass('method-modal--show');
  });

  /* Upgrade modal */
  var modal2 = $('.upgrade-modal');
  $(".upgrade-btn").on("click", function() {
    $(modal2).toggleClass('upgrade-modal--show');
  });

  $(".upgrade-overlay").on("click", function() {
    $(modal2).toggleClass('upgrade-modal--show');
  });

  $(".upgrade-modal__close").on("click", function() {
    $(modal2).toggleClass('upgrade-modal--show');
  });

});
