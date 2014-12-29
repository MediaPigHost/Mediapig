var casper = require('casper').create();

  casper.start('http://locahost:4333/', function() {
    this.test.assertTitle("Mediapig | Hosting without the hassle", "Mediapig homepage title is the one expected");
    this.test.assertExists('.body .btn', "main call to action is found");
  });

  casper.run(function() {
    this.test.done(2); // checks that 5 assertions have been executed
  });
