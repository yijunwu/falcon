/// <reference path="../interfaces.d.ts" />

import BrushableBar from './viz/brushable-bar';
import connection from './ws';
import API from './api';
import * as d3 from 'd3';

const config: {dimensions: Dimension[]} = require('../config.json');

const vizs: {[dimension: string]: BrushableBar} = {};

const dimensions = config.dimensions;
let activeDimension = dimensions[0];

const api = new API(dimensions, connection);

const CHART_WIDTH = 500;
const CHART_HEIGHT = 250;

connection.onOpen(() => {

  let lastExtent = null;
  const handleHover = (dimension: Dimension) => {
    return (domain: Interval) => {
      // Start preloading values from this dimension.
      const viz = vizs[dimension.name];
      const s = viz.x.range();
      const extent = (s.map(viz.x.invert, viz.x));
      api.preload(dimension, extent[0] + (extent[1] - extent[0]) / 2);
    };
  };

  const handleBrushStart = (dimension: Dimension) => {
    return (domain: Interval) => {
      const viz = vizs[dimension.name];
      const s = d3.event.selection || viz.x.range();
      const extent = (s.map(viz.x.invert, viz.x));

      // Extent [0] === [1] in this case so it doesn't matter
      // which we use. We need to hang on to this value tho
      // so that we can load the proper one on brush end.
      lastExtent = extent;
      api.load(dimension, extent[0]);
    };
  };

  const handleBrushMove = (dimension: Dimension) => {
    return (domain: Interval) => {
      console.log('brush move ' + dimension.name);
      const viz = vizs[dimension.name];
      const s = d3.event.selection || viz.x.range();
      const extent = (s.map(viz.x.invert, viz.x));
      api.setState(dimension, extent);
      if (extent[0] === lastExtent[0]) {
        api.preload(dimension, extent[1]);
      } else if (extent[1] === lastExtent[1]) {
        api.preload(dimension, extent[0]);
      } else {
        // How should we handle a brush that is moving on both sides??
        api.preload(dimension, extent[1]);
      }
      lastExtent = extent;
    };
  };

  const handleBrushEnd = (dimension: Dimension) => {
    return (domain: Interval) => {
      const viz = vizs[dimension.name];
      const s = d3.event.selection || viz.x.range();
      const extent = (s.map(viz.x.invert, viz.x));
      api.setRange(dimension, extent);
      if (extent[0] === lastExtent[0]) {
        api.load(dimension, extent[1]);
      } else if (extent[1] === lastExtent[1]) {
        api.load(dimension, extent[0]);
      } else {
        api.load(dimension, extent[0]);
        api.load(dimension, extent[1]);
      }
      lastExtent = extent;
    };
  };

  connection.onResult(api.onResult((dimension, data) => {
    // API filters the results so at this point
    // we only see results we want to draw to the
    // screen immediately.
    vizs[dimension].update(data);
  }));

  // Initialize empty charts
  dimensions.forEach(dim => {
    vizs[dim.name] = new BrushableBar(dim, {width: CHART_WIDTH, height: CHART_HEIGHT})
      .on('hover', handleHover(dim))
      .onBrush('start', handleBrushStart(dim))
      .onBrush('brush', handleBrushMove(dim))
      .onBrush('end', handleBrushEnd(dim));
  });

  // Initialize with resolutions
  api.init(dimensions.map((d) => {
    return {
      dimension: d.name,
      value: vizs[d.name].contentWidth
    };
  }));
});
