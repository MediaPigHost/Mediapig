$(document).ready(function(){

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

  $("#remove").click(function(){
      $('#panel').remove();
  });

  var modal = $('.modal');
  $(".btn").on("click", function() {
    $(modal).toggleClass('modal--show');
  });

  $(".overlay").on("click", function() {
    $(modal).toggleClass('modal--show');
  });

  $(".modal__close").on("click", function() {
    $(modal).toggleClass('modal--show');
  });

});
