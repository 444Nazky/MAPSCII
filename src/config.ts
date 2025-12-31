/*
  termap - Terminal Map Viewer
  by Michael Strassburger <codepoet@cpan.org>
*/

'use strict';

interface LayerConfig {
  margin?: number;
  cluster?: boolean;
}

interface LayersConfig {
  housenum_label: LayerConfig;
  poi_label: LayerConfig;
  place_label: LayerConfig;
  state_label: LayerConfig;
}

interface Config {
  language: string;
  source: string;
  styleFile: string;
  initialZoom: number | null;
  maxZoom: number;
  zoomStep: number;
  initialLat: number;
  initialLon: number;
  simplifyPolylines: boolean;
  useBraille: boolean;
  persistDownloadedTiles: boolean;
  tileRange: number;
  projectSize: number;
  labelMargin: number;
  layers: LayersConfig;
  input: any;
  output: any;
  headless: boolean;
  delimeter: string;
  poiMarker: string;
  // Dynamic properties that can be set at runtime
  [key: string]: any;
}

const config: Config = {
  language: 'en',

  // TODO: adapt to osm2vectortiles successor openmaptiles v3)
  // mapscii.me hosts the last available version, 2016-06-20
  source: 'http://mapscii.me/',

  //source: __dirname+"/../mbtiles/regensburg.mbtiles",

  styleFile: __dirname + '/../styles/dark.json',

  initialZoom: null,
  maxZoom: 18,
  zoomStep: 0.2,

  // sf lat: 37.787946, lon: -122.407522
  // iceland lat: 64.124229, lon: -21.811552
  // rgbg
  // lat: 49.019493, lon: 12.098341
  initialLat: 52.51298,
  initialLon: 13.42012,

  simplifyPolylines: false,

  useBraille: true,

  // Downloaded files get persisted in ~/.mapscii
  persistDownloadedTiles: true,

  tileRange: 14,
  projectSize: 256,

  labelMargin: 5,

  layers: {
    housenum_label: {
      margin: 4
    },
    poi_label: {
      cluster: true,
      margin: 5,
    },
    place_label: {
      cluster: true,
    },
    state_label: {
      cluster: true,
    },
  },

  input: process.stdin,
  output: process.stdout,

  headless: false,

  delimeter: '\n\r',

  poiMarker: '◉',
};

export = config;

