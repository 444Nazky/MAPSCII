/*
  termap - Terminal Map Viewer
  by Michael Strassburger <codepoet@cpan.org>

  Canvas-like painting abstraction for BrailleBuffer

  Implementation inspired by node-drawille-canvas (https://github.com/madbence/node-drawille-canvas)
  * added support for filled polygons
  * improved text rendering

  Will most likely be turned into a stand alone module at some point
 */
'use strict';

const bresenham = require('bresenham');
const earcut = require('earcut');
const BrailleBuffer = require('./BrailleBuffer');

interface Point {
  x: number;
  y: number;
}

class Canvas {
  width: number;
  height: number;
  buffer: typeof BrailleBuffer.prototype;
  static stack: any[];

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.buffer = new (BrailleBuffer as any)(width, height);
  }

  frame(): string {
    return this.buffer.frame();
  }

  clear(): void {
    this.buffer.clear();
  }

  text(text: string, x: number, y: number, color: number, center: boolean = false): void {
    this.buffer.writeText(text, x, y, color, center);
  }

  line(from: Point, to: Point, color: number, width: number = 1): void {
    this._line(from.x, from.y, to.x, to.y, width, color);
  }

  polyline(points: Point[], color: number, width: number = 1): void {
    for (let i = 1; i < points.length; i++) {
      const x1 = points[i - 1].x;
      const y1 = points[i - 1].y;
      this._line(x1, y1, points[i].x, points[i].y, width, color);
    }
  }

  setBackground(color: number): void {
    this.buffer.setGlobalBackground(color);
  }

  background(x: number, y: number, color: number): void {
    this.buffer.setBackground(x, y, color);
  }

  polygon(rings: Point[][], color: number): boolean {
    const vertices: number[] = [];
    const holes: number[] = [];
    for (let ringIdx = 0; ringIdx < rings.length; ringIdx++) {
      const ring = rings[ringIdx];
      if (vertices.length) {
        if (ring.length < 3) continue;
        holes.push(vertices.length / 2);
      } else {
        if (ring.length < 3) return false;
      }
      for (let i = 0; i < ring.length; i++) {
        const point = ring[i];
        vertices.push(point.x);
        vertices.push(point.y);
      }
    }

    let triangles: number[];
    try {
      triangles = earcut(vertices, holes);
    } catch (error) {
      return false;
    }
    for (let i = 0; i < triangles.length; i += 3) {
      const pa = this._polygonExtract(vertices, triangles[i]);
      const pb = this._polygonExtract(vertices, triangles[i + 1]);
      const pc = this._polygonExtract(vertices, triangles[i + 2]);
      this._filledTriangle(pa, pb, pc, color);
    }
    return true;
  }

  private _polygonExtract(vertices: number[], pointId: number): [number, number] {
    return [vertices[pointId * 2], vertices[pointId * 2 + 1]];
  }

  // Inspired by Alois Zingl's "The Beauty of Bresenham's Algorithm"
  // -> http://members.chello.at/~easyfilter/bresenham.html
  private _line(x0: number, y0: number, x1: number, y1: number, width: number, color: number): void {
    // Fall back to width-less bresenham algorithm if we dont have a width
    if (!(width = Math.max(0, width - 1))) {
      bresenham(x0, y0, x1, y1, (x: number, y: number) => {
        return this.buffer.setPixel(x, y, color);
      });
      return;
    }

    const dx = Math.abs(x1 - x0);
    const sx = x0 < x1 ? 1 : -1;
    const dy = Math.abs(y1 - y0);
    const sy = y0 < y1 ? 1 : -1;

    let err = dx - dy;

    const ed = dx + dy === 0 ? 1 : Math.sqrt(dx * dx + dy * dy);

    width = (width + 1) / 2;

    /* eslint-disable no-constant-condition */
    while (true) {
      this.buffer.setPixel(x0, y0, color);
      let e2 = err;
      let x2 = x0;
      if (2 * e2 >= -dx) {
        e2 += dy;
        let y2 = y0;
        while (e2 < ed * width && (y1 !== y2 || dx > dy)) {
          this.buffer.setPixel(x0, y2 += sy, color);
          e2 += dx;
        }
        if (x0 === x1) {
          break;
        }
        e2 = err;
        err -= dy;
        x0 += sx;
      }
      if (2 * e2 <= dy) {
        e2 = dx - e2;
        while (e2 < ed * width && (x1 !== x2 || dx < dy)) {
          this.buffer.setPixel(x2 += sx, y0, color);
          e2 += dy;
        }
        if (y0 === y1) {
          break;
        }
        err += dx;
        y0 += sy;
      }
    }
    /* eslint-enable */
  }

  private _filledRectangle(x: number, y: number, width: number, height: number, color: number): void {
    const pointA: [number, number] = [x, y];
    const pointB: [number, number] = [x + width, y];
    const pointC: [number, number] = [x, y + height];
    const pointD: [number, number] = [x + width, y + height];
    this._filledTriangle(pointA, pointB, pointC, color);
    this._filledTriangle(pointC, pointB, pointD, color);
  }

  private _bresenham(pointA: number[], pointB: number[]): Point[] {
    return bresenham(pointA[0], pointA[1], pointB[0], pointB[1]);
  }

  // Draws a filled triangle
  private _filledTriangle(pointA: [number, number], pointB: [number, number], pointC: [number, number], color: number): void {
    const a = this._bresenham(pointB, pointC);
    const b = this._bresenham(pointA, pointC);
    const c = this._bresenham(pointA, pointB);

    const points = a.concat(b).concat(c).filter((point: Point) => {
      return (0 <= point.y && point.y < this.height);
    }).sort(function(a: Point, b: Point) {
      if (a.y === b.y) {
        return a.x - b.x;
      } else {
        return a.y - b.y;
      }
    });

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const next = points[i + 1];

      if (point.y === (next || {}).y) {
        const left = Math.max(0, point.x);
        const right = Math.min(this.width - 1, next.x);
        if (left >= 0 && right <= this.width) {
          for (let x = left; x <= right; x++) {
            this.buffer.setPixel(x, point.y, color);
          }
        }
      } else {
        this.buffer.setPixel(point.x, point.y, color);
      }
      if (!next) {
        break;
      }
    }
  }
}

Canvas.stack = [];

export = Canvas;

