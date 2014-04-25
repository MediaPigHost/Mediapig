var express = require('express'),
    cons = require('consolidate'),
    data = require('./src/content/site.json'),
    app = express();

app.use(express.static(__dirname + '/public'));

app.engine('html', cons.swig);

// set .html as the default extension
app.set('view engine', 'html');
app.set('views', __dirname + '/src/templates');

app.get('/', function(req, res){
  res.render('index', data);
});

app.listen(4333);

console.log('Listening on port 4333');
