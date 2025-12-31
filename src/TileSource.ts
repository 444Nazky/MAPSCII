/*
  termap - Terminal Map Viewer
  by Michael Strassburger <codepoet@cpan.org>

  Source for VectorTiles - supports
  * remote TileServer
  * local MBTiles and VectorTiles
*/
'use strict';

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const envPaths = require('env-paths');
const paths = envPaths('mapscii');

const Tile = require('./Tile');
const config = require('./config');

// https://github.com/mapbox/node-mbtiles has native build dependencies (sqlite3)
// To maximize MapSCII's compatibility, MBTiles support must be manually added via
// $> npm install -g @mapbox/mbtiles
let MBTiles: any = null;
try {
  MBTiles = require('@mapbox/mbtiles');
} catch (err) { void 0; }

const modes = {
  MBTiles: 1,
  VectorTile: 2,
  HTTP: 3,
};

class TileSource {
  source: string;
  cache: { [key: string]: any };
  cacheSize: number;
  cached: string[];
  mode: number | null;
  mbtiles: any;
  styler: any;

  init(source: string): void {
    this.source = source;

    this.cache = {};
    this.cacheSize = 16;
    this.cached = [];

    this.mode = null;
    this.mbtiles = null;
    this.styler = null;

    if (this.source.startsWith('http')) {
      if (config.persistDownloadedTiles) {
        this._initPersistence();
      }

      this.mode = modes.HTTP;

    } else if (this.source.endsWith('.mbtiles')) {
      if (!MBTiles) {
        throw new Error('MBTiles support must be installed with following command: \'npm install -g @mapbox/mbtiles\'');
      }

      this.mode = modes.MBTiles;
      this.loadMBTiles(source);
    } else {
      throw new Error('source type isn\'t supported yet');
    }
  }

  loadMBTiles(source: string): Promise<void> {
    return new Promise((resolve, reject) => {
      new MBTiles(source, (err: Error, mbtiles: any) => {
        if (err) {
          reject(err);
        }
        this.mbtiles = mbtiles;
        resolve();
      });
    });
  }

  useStyler(styler: any): void {
    this.styler = styler;
  }

  getTile(z: number, x: number, y: number): Promise<any> {
    if (!this.mode) {
      throw new Error('no TileSource defined');
    }

    const cached = this.cache[[z, x, y].join('-')];
    if (cached) {
      return Promise.resolve(cached);
    }

    if (this.cached.length > this.cacheSize) {
      const overflow = Math.abs(this.cacheSize - this.cached.length);
      for (const tile in this.cached.splice(0, overflow)) {
        delete this.cache[tile];
      }
    }

    switch (this.mode) {
      case modes.MBTiles:
        return this._getMBTile(z, x, y);
      case modes.HTTP:
        return this._getHTTP(z, x, y);
    }
  }

  private _getHTTP(z: number, x: number, y: number): Promise<any> {
    let promise: Promise<any>;
    const persistedTile = this._getPersited(z, x, y);
    if (config.persistDownloadedTiles && persistedTile) {
      promise = Promise.resolve(persistedTile);
    } else {
      promise = fetch(this.source + [z, x, y].join('/') + '.pbf')
        .then((res: any) => res.buffer())
        .then((buffer: Buffer) => {
          if (config.persistDownloadedTiles) {
            this._persistTile(z, x, y, buffer);
            return buffer;
          }
        });
    }
    return promise.then((buffer: Buffer) => {
      return this._createTile(z, x, y, buffer);
    });
  }

  private _getMBTile(z: number, x: number, y: number): Promise<any> {
    return new Promise((resolve, reject) => {
      this.mbtiles.getTile(z, x, y, (err: Error, buffer: Buffer) => {
        if (err) {
          reject(err);
        }
        resolve(this._createTile(z, x, y, buffer));
      });
    });
  }

  private _createTile(z: number, x: number, y: number, buffer: Buffer): Tile {
    const name = [z, x, y].join('-');
    this.cached.push(name);

    const tile = this.cache[name] = new Tile(this.styler);
    return tile.load(buffer);
  }

  private _initPersistence(): void {
    try {
      this._createFolder(paths.cache);
    } catch (error) {
      config.persistDownloadedTiles = false;
    }
  }

  private _persistTile(z: number, x: number, y: number, buffer: Buffer): void {
    const zoom = z.toString();
    this._createFolder(path.join(paths.cache, zoom));
    const filePath = path.join(paths.cache, zoom, `${x}-${y}.pbf`);
    fs.writeFile(filePath, buffer, () => null);
  }

  private _getPersited(z: number, x: number, y: number): Buffer | false {
    try {
      return fs.readFileSync(path.join(paths.cache, z.toString(), `${x}-${y}.pbf`));
    } catch (error) {
      return false;
    }
  }

  private _createFolder(path: string): boolean {
    try {
      fs.mkdirSync(path);
      return true;
    } catch (error: any) {
      if (error.code === 'EEXIST') return true;
      throw error;
    }
  }
}

export = TileSource;

