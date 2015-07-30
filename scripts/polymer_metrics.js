//jscs:disable requireArrowFunctions

'use strict';

function PolymerMetrics(optTemplate) {
  var t = optTemplate || document;

  t.addEventListener('dom-change', function(e) {
    window.performance.mark('mark_dom_change_fired');
  });

  document.addEventListener('WebComponentsReady', function(e) {
    window.performance.mark('mark_WebComponentsReady_fired');
  });
}

PolymerMetrics.prototype.getFirstPaintTime = function() {
  var firstPaint = 0;
  var firstPaintTime;

  if (window.chrome && window.chrome.loadTimes) {
    // Convert to ms
    var loadTimes = window.chrome.loadTimes();
    firstPaint = loadTimes.firstPaintTime * 1000;
    firstPaintTime = firstPaint - (loadTimes.startLoadTime * 1000);
  } else if (typeof window.performance.timing.msFirstPaint === 'number') { // IE
    firstPaint = window.performance.timing.msFirstPaint;
    firstPaintTime = firstPaint - window.performance.timing.navigationStart;
  }

  return firstPaintTime;
};

PolymerMetrics.prototype.printPageMetrics = function() {
  // First paint.
  // var times = chrome.loadTimes();
  // firstPaintMetric = (times.firstPaintTime || performance.msFirstPaint)  - times.startLoadTime;
  // firstPaint = Math.min(firstPaintRaf, firstPaintMetric);
  // console.info('First paint @', firstPaint);

  var p = window.performance;

  p.measure('DOMContentLoaded', 'navigationStart', 'domContentLoadedEventEnd');
  p.measure('load', 'navigationStart', 'loadEventStart');
  p.measure('dom-change', 'navigationStart', 'mark_dom_change_fired');
  p.measure('WebComponentsReady', 'navigationStart',
            'mark_WebComponentsReady_fired');

  // console.log(performance.timing.domComplete - performance.timing.navigationStart)
  // console.debug('DOMContentLoaded', '@', p.timing.domComplete - p.timing.navigationStart, 'ms');//, item.duration, 'ms');

  console.info('POLYMER METRICS');

  var items = p.getEntriesByType('measure').sort(function(a, b) {
    return a.duration - b.duration;
  });

  // jshint boss:true
  for (var i = 0, item; item = items[i]; ++i) {
    console.debug(item.name, '@', item.duration, 'ms');
  }

  // console.info('First paint @', polyMetrics.getFirstPaintTime());
};

// if (window.PolymerMetrics) {
//   var polyMetrics = new PolymerMetrics(template);
//   window.addEventListener('load', polyMetrics.printPageMetrics);
// }

// Main page:
//
// var firstPaintRaf;
// requestAnimationFrame(function() {
//   firstPaintRaf = performance.now();
// });

// if (window.PolymerMetrics) {
//   var polyMetrics = new PolymerMetrics(template);
//   window.addEventListener('load', polyMetrics.printPageMetrics);
// }
