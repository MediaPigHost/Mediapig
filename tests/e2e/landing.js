var data = require('../../src/content/site.json');

casper.test.begin("Landing Page Loads", 2, function(test) {

  casper.start('http:' + data.url + '/', function() {
    test.assertTitle("Mediapig | Hosting without the hassle", "Mediapig homepage title is the one expected");
    test.assertExists('.body .btn', "main call to action is found");
  });

  casper.run(function() {
    test.done();
  });
});
