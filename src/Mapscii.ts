/*
  MapSCII - Terminal Map Viewer
  by Michael Strassburger <codepoet@cpan.org>

  UI and central command center
*/
'use strict';

const fs = require('fs');
const keypress = require('keypress');
const TermMouse = require('term-mouse');

const Renderer = require('./Renderer');
const TileSource = require('./TileSource');
const utils = require('./utils');
let config = require('./config');

interface MousePosition {
  lat: number;
  lon: number;
  x?: number;
  y?: number;
}

interface Size {
  width?: number;
  height?: number;
}

interface Options {
  initialLat?: number;
  initialLon?: number;
  initialZoom?: number | null;
  size?: Size;
  useBraille?: boolean;
  headless?: boolean;
  source?: string;
  styleFile?: string;
}

class Mapscii {
  width: number | null;
  height: number | null;
  canvas: any;
  mouse: any;
  mouseDragging!: boolean | { x: number; y: number; center: any };
  mousePosition: MousePosition;
  tileSource!: any;
  renderer!: any;
  zoom: number;
  minZoom: number | null;
  center: { lat: number; lon: number };

  constructor(options: Options = {}) {
    this.width = null;
    this.height = null;
    this.canvas = null;
    this.mouse = null;

    this.mouseDragging = false;
    this.mousePosition = {
      x: 0,
      y: 0,
      lat: 0,
      lon: 0,
    };

    this.tileSource = null;
    this.renderer = null;

    this.zoom = 0;
    this.minZoom = null;
    config = Object.assign(config, options);

    this.center = {
      lat: config.initialLat,
      lon: config.initialLon
    };
  }

  async init(): Promise<void> {
    if (!config.headless) {
      this._initKeyboard();
      this._initMouse();
    }
    this._initTileSource();
    this._initRenderer();
    this._draw();
    this.notify('Welcome to MapSCII! Use your cursors to navigate, a/z to zoom, q to quit.');
  }


  private _initTileSource(): void {
    this.tileSource = new TileSource();
    this.tileSource.init(config.source);
  }

  private _initKeyboard(): void {
    keypress(config.input);
    if (config.input.setRawMode) {
      config.input.setRawMode(true);
    }
    config.input.resume();

    config.input.on('keypress', (ch: any, key: any) => this._onKey(key));
  }

  private _initMouse(): void {
    this.mouse = TermMouse({
      input: config.input,
      output: config.output,
    });
    this.mouse.start();

    this.mouse.on('click', (event: any) => this._onClick(event));
    this.mouse.on('scroll', (event: any) => this._onMouseScroll(event));
    this.mouse.on('move', (event: any) => this._onMouseMove(event));
  }

  private _initRenderer(): void {
    const style = JSON.parse(fs.readFileSync(config.styleFile, 'utf8'));
    this.renderer = new Renderer(config.output, this.tileSource, style);

    config.output.on('resize', () => {
      this._resizeRenderer();
      this._draw();
    });

    this._resizeRenderer();
    this.zoom = (config.initialZoom !== null) ? config.initialZoom : (this.minZoom || 0);
  }

  private _resizeRenderer(): void {
    this.width = config.size && config.size.width ? config.size.width * 2 : config.output.columns >> 1 << 2;
    this.height = config.size && config.size.height ? config.size.height * 4 : config.output.rows * 4 - 4;

    this.minZoom = 4 - Math.log(4096 / this.width!) / Math.LN2;

    this.renderer!.setSize(this.width!, this.height!);
  }

  private _colrow2ll(x: number, y: number): MousePosition {
    const projected = {
      x: (x - 0.5) * 2,
      y: (y - 0.5) * 4,
    };

    const size = utils.tilesizeAtZoom(this.zoom);
    const [dx, dy] = [projected.x - (this.width || 0) / 2, projected.y - (this.height || 0) / 2];

    const z = utils.baseZoom(this.zoom);
    const center = utils.ll2tile(this.center.lon, this.center.lat, z);

    return utils.normalize(utils.tile2ll(center.x + (dx / size), center.y + (dy / size), z));
  }

  private _updateMousePosition(event: any): void {
    this.mousePosition = this._colrow2ll(event.x, event.y);
  }

  private _onClick(event: any): void {
    if (event.x < 0 || event.x > this.width! / 2 || event.y < 0 || event.y > this.height! / 4) {
      return;
    }
    this._updateMousePosition(event);

    if (this.mouseDragging && typeof this.mouseDragging === 'object' && event.button === 'left') {
      this.mouseDragging = false;
    } else {
      this.setCenter(this.mousePosition.lat, this.mousePosition.lon);
    }

    this._draw();
  }

  private _onMouseScroll(event: any): void {
    this._updateMousePosition(event);

    // the location of the pointer, where we want to zoom toward
    const targetMouseLonLat = this._colrow2ll(event.x, event.y);

    // zoom toward the center
    this.zoomBy(config.zoomStep * (event.button === 'up' ? 1 : -1));

    // the location the pointer ended up after zooming
    const offsetMouseLonLat = this._colrow2ll(event.x, event.y);

    const z = utils.baseZoom(this.zoom);
    // the projected locations
    const targetMouseTile = utils.ll2tile(targetMouseLonLat.lon, targetMouseLonLat.lat, z);
    const offsetMouseTile = utils.ll2tile(offsetMouseLonLat.lon, offsetMouseLonLat.lat, z);

    // the projected center
    const centerTile = utils.ll2tile(this.center.lon, this.center.lat, z);

    // calculate a new center that puts the pointer back in the target location
    const offsetCenterLonLat = utils.tile2ll(
      centerTile.x - (offsetMouseTile.x - targetMouseTile.x),
      centerTile.y - (offsetMouseTile.y - targetMouseTile.y),
      z
    );
    // move to the new center
    this.setCenter(offsetCenterLonLat.lat, offsetCenterLonLat.lon);

    this._draw();
  }

  private _onMouseMove(event: any): void {
    if (event.x < 0 || event.x > this.width! / 2 || event.y < 0 || event.y > this.height! / 4) {
      return;
    }
    if (config.mouseCallback && !config.mouseCallback(event)) {
      return;
    }

    // start dragging
    if (event.button === 'left') {
      if (this.mouseDragging && typeof this.mouseDragging === 'object') {
        const dx = (this.mouseDragging.x - event.x) * 2;
        const dy = (this.mouseDragging.y - event.y) * 4;

        const size = utils.tilesizeAtZoom(this.zoom);

        const newCenter = utils.tile2ll(
          this.mouseDragging.center.x + (dx / size),
          this.mouseDragging.center.y + (dy / size),
          utils.baseZoom(this.zoom)
        );

        this.setCenter(newCenter.lat, newCenter.lon);

        this._draw();

      } else {
        this.mouseDragging = {
          x: event.x,
          y: event.y,
          center: utils.ll2tile(this.center.lon, this.center.lat, utils.baseZoom(this.zoom)),
        };
      }
    }

    this._updateMousePosition(event);
    this.notify(this._getFooter());
  }

  private _onKey(key: any): void {
    if (config.keyCallback && !config.keyCallback(key)) return;
    if (!key || !key.name) return;

    // check if the pressed key is configured
    let draw = true;
    switch (key.name) {
      case 'q':
        if (config.quitCallback) {
          config.quitCallback();
        } else {
          process.exit(0);
        }
        break;
      case 'a':
        this.zoomBy(config.zoomStep);
        break;
      case 'y':
      case 'z':
        this.zoomBy(-config.zoomStep);
        break;
      case 'left':
      case 'h':
        this.moveBy(0, -8 / Math.pow(2, this.zoom));
        break;
      case 'right':
      case 'l':
        this.moveBy(0, 8 / Math.pow(2, this.zoom));
        break;
      case 'up':
      case 'k':
        this.moveBy(6 / Math.pow(2, this.zoom), 0);
        break;
      case 'down':
      case 'j':
        this.moveBy(-6 / Math.pow(2, this.zoom), 0);
        break;
      case 'c':
        config.useBraille = !config.useBraille;
        break;
      default:
        draw = false;
    }

    if (draw) {
      this._draw();
    }
  }

  private _draw(): void {
    if (this.renderer) {
      this.renderer.draw(this.center, this.zoom).then((frame: string) => {
        this._write(frame);
        this.notify(this._getFooter());
      }).catch(() => {
        this.notify('renderer is busy');
      });
    }
  }

  private _getFooter(): string {
    // tile = utils.ll2tile(this.center.lon, this.center.lat, this.zoom);
    // `tile: ${utils.digits(tile.x, 3)}, ${utils.digits(tile.x, 3)}   `+

    let footer = `center: ${utils.digits(this.center.lat, 3)}, ${utils.digits(this.center.lon, 3)} `;
    footer += `  zoom: ${utils.digits(this.zoom, 2)} `;
    if (this.mousePosition.lat !== undefined) {
      footer += `  mouse: ${utils.digits(this.mousePosition.lat, 3)}, ${utils.digits(this.mousePosition.lon, 3)} `;
    }
    return footer;
  }

  notify(text: string): void {
    config.onUpdate && config.onUpdate();
    if (!config.headless) {
      this._write('\r\x1B[K' + text);
    }
  }

  private _write(output: string): void {
    config.output.write(output);
  }

  zoomBy(step: number): number {
    const minZoomVal = this.minZoom || 0;
    if (this.zoom + step < minZoomVal) {
      return this.zoom = minZoomVal;
    }
    if (this.zoom + step > config.maxZoom) {
      return this.zoom = config.maxZoom;
    }

    this.zoom += step;
    return this.zoom;
  }

  moveBy(lat: number, lon: number): void {
    this.setCenter(this.center.lat + lat, this.center.lon + lon);
  }

  setCenter(lat: number, lon: number): void {
    this.center = utils.normalize({
      lon: lon,
      lat: lat,
    });
  }
}

export = Mapscii;

