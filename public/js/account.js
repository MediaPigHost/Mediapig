define(['require', 'exports', 'module', 'helpers', 'microAjax', 'js!google'], function (require, exports, module, helpers, microAjax) {
  var account = {
    init : function(){
      this.events();
      this.graphs.init();
    },
    events : function(){

    },
    graphs : {
      init: function(){
        // console.log(google);
        setTimeout(google.load("visualization", "1", {packages:["corechart"], callback: function() {}}) , 2000);
        google.setOnLoadCallback(drawChart);
        function drawChart() {

            var graphs = [{
              options : {
                curveType: 'function',
                hAxis: {
                  textStyle : {
                    color: '#999'
                  },
                  gridlines: {
                    color: 'transparent'
                  },
                  baselineColor: 'transparent'
                },
                vAxis: {
                  textStyle: {
                    color: '#999'
                  },
                  minValue: 0,
                  maxValue: 100,
                  logScale: true,
                  gridlines: {
                    color: 'transparent'
                  },
                  baselineColor: 'transparent'
                },
                legend: {
                  position: 'none'
                },
                width: 591,
                height: 155,
                chartArea: {
                  width: '100%',
                  height: '80%'
                },
                backgroundColor: {
                  fill: 'transparent',
                  stroke: 'transparent',
                  strokeWidth: 0
                },
                tooltip : {
                  trigger: 'none'
                },
                crosshair: {
                  color: 'transparent'
                },
                colors: ['#a5d3ed'],
                dataOpacity: 0.3
              }
            }, {
              options : {
                curveType: 'function',
                hAxis: {
                  textStyle : {
                    color: '#999'
                  },
                  gridlines: {
                    color: 'transparent'
                  },
                  baselineColor: 'transparent'
                },
                vAxis: {
                  textStyle: {
                    color: '#999'
                  },
                  minValue: 0,
                  maxValue: 100,
                  logScale: true,
                  gridlines: {
                    color: 'transparent'
                  },
                  baselineColor: 'transparent'
                },
                legend: {
                  position: 'none'
                },
                width: 591,
                height: 155,
                chartArea: {
                  width: '100%',
                  height: '80%'
                },
                backgroundColor: {
                  fill: 'transparent',
                  stroke: 'transparent',
                  strokeWidth: 0
                },
                tooltip : {
                  trigger: 'none'
                },
                crosshair: {
                  color: 'transparent'
                },
                colors: ['#edd1a5'],
                dataOpacity: 0.3
              }
            }];

            graphs[0].data = new google.visualization.DataTable();
            graphs[0].data.addColumn('datetime', 'Time');
            graphs[0].data.addColumn('number', 'Load');
            graphs[0].data.addRows([
              [new Date(2015,01,9,01,00,0), 3],
              [new Date(2015,01,9,02,00,0), 7],
              [new Date(2015,01,9,03,00,0), 90],
              [new Date(2015,01,9,04,00,0), 5],
              [new Date(2015,01,9,05,00,0), 3],
              [new Date(2015,01,9,06,00,0), 7],
              [new Date(2015,01,9,07,00,0), 2],
              [new Date(2015,01,9,08,00,0), 5],
              [new Date(2015,01,9,09,00,0), 3],
              [new Date(2015,01,9,10,00,0), 7],
              [new Date(2015,01,9,11,00,0), 90],
              [new Date(2015,01,9,12,00,0), 5],
              [new Date(2015,01,9,13,00,0), 3],
              [new Date(2015,01,9,14,00,0), 7],
              [new Date(2015,01,9,16,00,0), 90],
              [new Date(2015,01,9,17,00,0), 5],
              [new Date(2015,01,9,18,00,0), 3],
              [new Date(2015,01,9,19,00,0), 7],
              [new Date(2015,01,9,20,00,0), 2],
              [new Date(2015,01,9,21,00,0), 5],
              [new Date(2015,01,9,22,00,0), 3],
              [new Date(2015,01,9,23,00,0), 7],
              [new Date(2015,01,9,24,00,0), 90]
              ]);

            graphs[1].data = new google.visualization.DataTable();
            graphs[1].data.addColumn('datetime', 'Time');
            graphs[1].data.addColumn('number', 'Load');
            graphs[1].data.addRows([
              [new Date(2015,01,9,01,00,0), 6],
              [new Date(2015,01,9,02,00,0), 10],
              [new Date(2015,01,9,03,00,0), 4],
              [new Date(2015,01,9,04,00,0), 6],
              [new Date(2015,01,9,05,00,0), 9],
              [new Date(2015,01,9,06,00,0), 10],
              [new Date(2015,01,9,07,00,0), 24],
              [new Date(2015,01,9,08,00,0), 25],
              [new Date(2015,01,9,09,00,0), 29],
              [new Date(2015,01,9,10,00,0), 40],
              [new Date(2015,01,9,11,00,0), 80],
              [new Date(2015,01,9,12,00,0), 10],
              [new Date(2015,01,9,13,00,0), 6],
              [new Date(2015,01,9,14,00,0), 10],
              [new Date(2015,01,9,15,00,0), 4],
              [new Date(2015,01,9,16,00,0), 6],
              [new Date(2015,01,9,17,00,0), 9],
              [new Date(2015,01,9,18,00,0), 10],
              [new Date(2015,01,9,19,00,0), 24],
              [new Date(2015,01,9,20,00,0), 25],
              [new Date(2015,01,9,21,00,0), 29],
              [new Date(2015,01,9,22,00,0), 40],
              [new Date(2015,01,9,23,00,0), 80],
              [new Date(2015,01,9,24,00,0), 10]
              ]);

            function resize(){
              var chartEl = document.getElementById('chart_div'),
                  chart = new google.visualization.AreaChart(chartEl),
                  chartContainer = chartEl.parentNode;

              chartEl.style.width = chartContainer.offsetWidth + 'px';
              graphs[0].options.width = chartContainer.offsetWidth;
              chart.draw(graphs[0].data, graphs[0].options);

              var chartEl = document.getElementById('chart2_div'),
                  chart2 = new google.visualization.AreaChart(chartEl),
                  chartContainer = chartEl.parentNode;

              chartEl.style.width = chartContainer.offsetWidth + 'px';
              graphs[1].options.width = chartContainer.offsetWidth;
              chart2.draw(graphs[1].data, graphs[1].options);
            }

            window.onload = resize();
            window.onresize = resize;
          }
      }
    }
  }
  module.exports = account;
});
