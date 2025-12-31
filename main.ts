/*
  MapSCII - Terminal Map Viewer
  by Michael Strassburger <codepoet@cpan.org>
  Discover the planet in your console!

  This scripts boots up the application.

  TODO: params parsing and so on
*/
'use strict';

const config = require('./src/config');
const Mapscii = require('./src/Mapscii');

interface ArgvOptions {
  latitude?: number;
  longitude?: number;
  zoom?: number;
  width?: number;
  height?: number;
  braille?: boolean;
  headless?: boolean;
  tile_source?: string;
  style_file?: string;
}

const yargs = require('yargs')
  .option('latitude', {
    alias: 'lat',
    description: 'Latitude of initial centre',
    default: config.initialLat,
    type: 'number',
  })
  .option('longitude', {
    alias: 'lon',
    description: 'Longitude of initial centre',
    default: config.initialLon,
    type: 'number',
  })
  .option('zoom', {
    alias: 'z',
    description: 'Initial zoom',
    default: config.initialZoom,
    type: 'number',
  })
  .option('width', {
    alias: 'w',
    description: 'Fixed width of rendering',
    type: 'number',
  })
  .option('height', {
    alias: 'h',
    description: 'Fixed height of rendering',
    type: 'number',
  })
  .option('braille', {
    alias: 'b',
    description: 'Activate braille rendering',
    default: config.useBraille,
    type: 'boolean',
  })
  .option('headless', {
    alias: 'H',
    description: 'Activate headless mode',
    default: config.headless,
    type: 'boolean',
  })
  .option('tile_source', {
    alias: 'tileSource',
    description: 'URL or path to osm2vectortiles source',
    default: config.source,
    type: 'string',
  })
  .option('style_file', {
    alias: 'style',
    description: 'path to json style file',
    default: config.styleFile,
    type: 'string',
  })
  .strict();

const argv = yargs.argv as ArgvOptions;

const options = {
  initialLat: argv.latitude,
  initialLon: argv.longitude,
  initialZoom: argv.zoom,
  size: {
    width: argv.width,
    height: argv.height
  },
  useBraille: argv.braille,
  headless: argv.headless,
  source: argv.tile_source,
  styleFile: argv.style_file,
};

const mapscii = new Mapscii(options);
mapscii.init().catch((err: Error) => {
  console.error('Failed to start MapSCII.');
  console.error(err);
});

